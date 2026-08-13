const http=require('http');
const crypto=require('crypto');
const PORT=Number(process.env.PORT||8787);
const store=new Map();
const seen=new Map();
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify(data));};
const body=req=>new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>5e6)reject(Error('BODY_TOO_LARGE'))});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})});
const key=req=>req.headers['idempotency-key'];
const eventId=x=>x?.eventId||x?.id||crypto.randomUUID();
const applyEvent=e=>{const id=eventId(e);if(seen.has(id))return {duplicate:true,id};seen.set(id,Date.now());const scope=e.locationId||'default';const a=store.get(scope)||[];a.push({...e,eventId:id,receivedAt:new Date().toISOString()});store.set(scope,a);return {duplicate:false,id};};
const routes={
 '/api/v1/health':async()=>({ok:true,service:'mk-foods-cloud',time:new Date().toISOString(),locations:store.size}),
 '/api/v1/sync/push':async(req)=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];return {ok:true,results:events.map(applyEvent),accepted:events.length}},
 '/api/v1/sync/pull':async(req)=>{const u=new URL(req.url,'http://localhost');const location=u.searchParams.get('location')||'default';return {ok:true,events:store.get(location)||[]}},
 '/api/v1/reconcile':async(req)=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];const results=events.map(applyEvent);return {ok:true,results,pending:0}},
};
const server=http.createServer(async(req,res)=>{if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,idempotency-key,x-api-key'});return res.end()};try{if(req.method==='GET'&&routes[req.url.split('?')[0]])return json(res,200,await routes[req.url.split('?')[0]](req));if(req.method==='POST'&&routes[req.url.split('?')[0]]){if(req.headers['idempotency-key']&&seen.has(req.headers['idempotency-key']))return json(res,200,{ok:true,duplicate:true,id:req.headers['idempotency-key']});return json(res,200,await routes[req.url.split('?')[0]](req))}json(res,404,{ok:false,error:'NOT_FOUND'})}catch(e){json(res,400,{ok:false,error:e.message||'BAD_REQUEST'})}});
server.listen(PORT,()=>console.log(`MK Foods Cloud API listening on :${PORT}`));
