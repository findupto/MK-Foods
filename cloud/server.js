const http=require('http');
const crypto=require('crypto');
const PORT=Number(process.env.PORT||8787);
const API_KEY=process.env.MK_FOODS_API_KEY||'';
const ORIGIN=process.env.MK_FOODS_CORS_ORIGIN||'*';
const MAX_EVENTS=Number(process.env.MK_FOODS_MAX_EVENTS||10000);
const RATE_LIMIT=Number(process.env.MK_FOODS_RATE_LIMIT||120);
const RATE_WINDOW=60_000;
const EVENT_TTL=24*60*60*1000;
const store=new Map();
const seen=new Map();
const rates=new Map();
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,idempotency-key,x-api-key'});res.end(JSON.stringify(data));};
const body=req=>new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>5e6){reject(Error('BODY_TOO_LARGE'));req.destroy()}});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})});
const eventId=x=>x?.eventId||x?.id||crypto.randomUUID();
function authorized(req){if(!API_KEY)return true;const supplied=String(req.headers['x-api-key']||'');return supplied.length===API_KEY.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(API_KEY))}
function rateLimited(req){const key=String(req.socket.remoteAddress||'unknown');const t=Date.now();const r=rates.get(key);if(!r||t-r.start>=RATE_WINDOW){rates.set(key,{start:t,count:1});return false}r.count++;return r.count>RATE_LIMIT}
function cleanup(){const t=Date.now();for(const [k,v] of seen)if(t-v>EVENT_TTL)seen.delete(k);for(const [k,v] of rates)if(t-v.start>RATE_WINDOW*2)rates.delete(k);for(const [scope,events] of store)if(events.length>MAX_EVENTS)store.set(scope,events.slice(-MAX_EVENTS))}
const applyEvent=e=>{const id=eventId(e);if(seen.has(id))return {duplicate:true,id};seen.set(id,Date.now());const scope=String(e.locationId||'default');const a=store.get(scope)||[];a.push({...e,eventId:id,receivedAt:new Date().toISOString()});store.set(scope,a.length>MAX_EVENTS?a.slice(-MAX_EVENTS):a);return {duplicate:false,id}};
const routes={
 '/api/v1/health':async()=>({ok:true,service:'mk-foods-cloud',time:new Date().toISOString(),locations:store.size,authRequired:Boolean(API_KEY)}),
 '/api/v1/sync/push':async(req)=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];if(events.length>1000)throw Error('TOO_MANY_EVENTS');return {ok:true,results:events.map(applyEvent),accepted:events.length}},
 '/api/v1/sync/pull':async(req)=>{const u=new URL(req.url,'http://localhost');const location=u.searchParams.get('location')||'default';const after=u.searchParams.get('after');let events=store.get(location)||[];if(after)events=events.filter(e=>e.receivedAt>after);return {ok:true,events}},
 '/api/v1/reconcile':async(req)=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];if(events.length>1000)throw Error('TOO_MANY_EVENTS');const results=events.map(applyEvent);return {ok:true,results,pending:0}},
};
setInterval(cleanup,60_000).unref();
const server=http.createServer(async(req,res)=>{if(req.method==='OPTIONS')return json(res,204,{});try{if(rateLimited(req))return json(res,429,{ok:false,error:'RATE_LIMITED'});if(!authorized(req))return json(res,401,{ok:false,error:'UNAUTHORIZED'});const route=routes[req.url.split('?')[0]];if(!route)return json(res,404,{ok:false,error:'NOT_FOUND'});if(req.method==='GET')return json(res,200,await route(req));if(req.method==='POST'){const idem=req.headers['idempotency-key'];if(idem&&seen.has(idem))return json(res,200,{ok:true,duplicate:true,id:idem});return json(res,200,await route(req))}return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});}catch(e){const status=e.message==='BODY_TOO_LARGE'?413:e.message==='TOO_MANY_EVENTS'?413:400;return json(res,status,{ok:false,error:e.message||'BAD_REQUEST'})}});
server.listen(PORT,()=>console.log(`MK Foods Cloud API listening on :${PORT}`));
