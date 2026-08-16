const http=require('http');
const crypto=require('crypto');
const PORT=Number(process.env.PORT||8787);
const API_KEY=process.env.MK_FOODS_API_KEY||'';
const ORIGIN=process.env.MK_FOODS_CORS_ORIGIN||'*';
const MAX_EVENTS=Math.max(100,Number(process.env.MK_FOODS_MAX_EVENTS||10000));
const RATE_LIMIT=Math.max(10,Number(process.env.MK_FOODS_RATE_LIMIT||120));
const RATE_WINDOW=60_000;
const EVENT_TTL=24*60*60*1000;
const MAX_BODY=5e6;
const store=new Map(),seen=new Map(),rates=new Map(),idempotency=new Map();
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,idempotency-key,x-api-key'});res.end(JSON.stringify(data));};
const body=req=>new Promise((resolve,reject)=>{let b='',done=false;req.on('data',c=>{if(done)return;b+=c;if(b.length>MAX_BODY){done=true;reject(Error('BODY_TOO_LARGE'));req.destroy()}});req.on('end',()=>{if(done)return;try{resolve(b?JSON.parse(b):{})}catch(e){reject(Error('INVALID_JSON'))}});req.on('error',reject)});
const eventId=x=>x?.eventId||x?.id||crypto.randomUUID();
function authorized(req){if(!API_KEY)return true;const supplied=String(req.headers['x-api-key']||'');const a=Buffer.from(supplied),b=Buffer.from(API_KEY);return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function rateLimited(req){const key=String(req.socket.remoteAddress||'unknown');const t=Date.now();const r=rates.get(key);if(!r||t-r.start>=RATE_WINDOW){rates.set(key,{start:t,count:1});return false}r.count++;return r.count>RATE_LIMIT}
function cleanup(){const t=Date.now();for(const [k,v] of seen)if(t-v>EVENT_TTL)seen.delete(k);for(const [k,v] of idempotency)if(t-v.at>EVENT_TTL)idempotency.delete(k);for(const [k,v] of rates)if(t-v.start>RATE_WINDOW*2)rates.delete(k);for(const [scope,events] of store)if(events.length>MAX_EVENTS)store.set(scope,events.slice(-MAX_EVENTS))}
const applyEvent=e=>{const id=eventId(e);if(seen.has(id))return{duplicate:true,id};seen.set(id,Date.now());const scope=String(e.locationId||'default');const a=store.get(scope)||[];a.push({...e,eventId:id,receivedAt:new Date().toISOString()});store.set(scope,a.length>MAX_EVENTS?a.slice(-MAX_EVENTS):a);return{duplicate:false,id}};
const routes={
 '/api/v1/health':async()=>({ok:true,service:'mk-foods-cloud',time:new Date().toISOString(),locations:store.size,authRequired:Boolean(API_KEY)}),
 '/api/v1/sync/push':async req=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];if(events.length>1000)throw Error('TOO_MANY_EVENTS');return{ok:true,results:events.map(applyEvent),accepted:events.length}},
 '/api/v1/sync/pull':async req=>{const u=new URL(req.url,'http://localhost');const location=u.searchParams.get('location')||'default';const after=u.searchParams.get('after');let events=store.get(location)||[];if(after)events=events.filter(e=>e.receivedAt>after);return{ok:true,events}},
 '/api/v1/reconcile':async req=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];if(events.length>1000)throw Error('TOO_MANY_EVENTS');return{ok:true,results:events.map(applyEvent),pending:0}},
};
setInterval(cleanup,60_000).unref();
const server=http.createServer(async(req,res)=>{if(req.method==='OPTIONS')return json(res,204,{});try{if(rateLimited(req))return json(res,429,{ok:false,error:'RATE_LIMITED'});if(!authorized(req))return json(res,401,{ok:false,error:'UNAUTHORIZED'});const route=routes[req.url.split('?')[0]];if(!route)return json(res,404,{ok:false,error:'NOT_FOUND'});if(req.method==='GET'){if(req.url.split('?')[0]!=='/api/v1/sync/pull'&&req.url.split('?')[0]!=='/api/v1/health')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});return json(res,200,await route(req))}if(req.method==='POST'){const idem=String(req.headers['idempotency-key']||'');if(idem&&idempotency.has(idem))return json(res,200,{...idempotency.get(idem).response,duplicate:true});const response=await route(req);if(idem)idempotency.set(idem,{at:Date.now(),response});return json(res,200,response)}return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});}catch(e){const status=e.message==='BODY_TOO_LARGE'||e.message==='TOO_MANY_EVENTS'?413:e.message==='INVALID_JSON'?400:400;return json(res,status,{ok:false,error:e.message||'BAD_REQUEST'})}});
server.listen(PORT,()=>console.log(`MK Foods Cloud API listening on :${PORT}`));
