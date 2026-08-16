const http=require('http');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const PORT=Number(process.env.PORT||8787);
const NODE_ENV=String(process.env.NODE_ENV||'development').toLowerCase();
const API_KEY=String(process.env.MK_FOODS_API_KEY||'');
const REQUIRE_AUTH=String(process.env.MK_FOODS_REQUIRE_AUTH||((NODE_ENV==='production')?'true':'false')).toLowerCase()==='true';
const ORIGIN=process.env.MK_FOODS_CORS_ORIGIN||'https://pos.mk-foods.local';
const MAX_EVENTS=Math.max(100,Number(process.env.MK_FOODS_MAX_EVENTS||10000));
const RATE_LIMIT=Math.max(10,Number(process.env.MK_FOODS_RATE_LIMIT||120));
const RATE_WINDOW=60_000;
const EVENT_TTL=24*60*60*1000;
const MAX_BODY=5e6;
const DATA_DIR=path.resolve(process.env.MK_FOODS_DATA_DIR||path.join(process.cwd(),'data'));
const STORE_FILE=path.join(DATA_DIR,'events.json');
const BACKUP_FILE=path.join(DATA_DIR,'events.backup.json');

const store=new Map(),seen=new Map(),rates=new Map(),idempotency=new Map();
const json=(res,status,data,requestId)=>{
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'access-control-allow-origin':ORIGIN,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type,idempotency-key,x-api-key,x-request-id',
    'x-request-id':requestId
  });
  res.end(JSON.stringify(data));
};
const body=req=>new Promise((resolve,reject)=>{let b='',done=false;req.on('data',c=>{if(done)return;b+=c;if(b.length>MAX_BODY){done=true;reject(Error('BODY_TOO_LARGE'));req.destroy()}});req.on('end',()=>{if(done)return;try{resolve(b?JSON.parse(b):{})}catch(e){reject(Error('INVALID_JSON'))}});req.on('error',reject)});
const eventId=x=>x?.eventId||x?.id||crypto.randomUUID();
const requestId=req=>String(req.headers['x-request-id']||crypto.randomUUID()).slice(0,128);
function authorized(req){
  if(!REQUIRE_AUTH&&!API_KEY)return true;
  if(!API_KEY)return false;
  const supplied=String(req.headers['x-api-key']||'');
  const a=Buffer.from(supplied),b=Buffer.from(API_KEY);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function rateLimited(req){const key=String(req.socket.remoteAddress||'unknown');const t=Date.now();const r=rates.get(key);if(!r||t-r.start>=RATE_WINDOW){rates.set(key,{start:t,count:1});return false}r.count++;return r.count>RATE_LIMIT}
function saveStore(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const payload=JSON.stringify(Object.fromEntries(store));
  const tmp=STORE_FILE+'.tmp';
  if(fs.existsSync(STORE_FILE))fs.copyFileSync(STORE_FILE,BACKUP_FILE);
  fs.writeFileSync(tmp,payload,{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,STORE_FILE);
}
function loadStore(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  let raw='';
  try{raw=fs.readFileSync(STORE_FILE,'utf8')}catch(e){try{raw=fs.readFileSync(BACKUP_FILE,'utf8')}catch(_) {raw=''}}
  if(!raw)return;
  try{const parsed=JSON.parse(raw);for(const [scope,events] of Object.entries(parsed)){if(Array.isArray(events))for(const e of events){store.set(scope,(store.get(scope)||[]).concat(e));if(e.eventId)seen.set(String(e.eventId),Date.now())}}}catch(e){throw new Error('PERSISTED_STORE_INVALID')}
}
function cleanup(){const t=Date.now();for(const [k,v] of seen)if(t-v>EVENT_TTL)seen.delete(k);for(const [k,v] of idempotency)if(t-v.at>EVENT_TTL)idempotency.delete(k);for(const [k,v] of rates)if(t-v.start>RATE_WINDOW*2)rates.delete(k);for(const [scope,events] of store)if(events.length>MAX_EVENTS)store.set(scope,events.slice(-MAX_EVENTS));saveStore()}
const applyEvent=e=>{
  const id=eventId(e);
  if(seen.has(id))return{duplicate:true,id};
  const scope=String(e.locationId||'default').trim()||'default';
  if(scope.length>128)throw Error('LOCATION_ID_INVALID');
  seen.set(id,Date.now());
  const a=store.get(scope)||[];
  const receivedAt=new Date().toISOString();
  a.push({...e,eventId:id,locationId:scope,receivedAt});
  store.set(scope,a.length>MAX_EVENTS?a.slice(-MAX_EVENTS):a);
  return{duplicate:false,id};
};
const routes={
 '/api/v1/health':async()=>({ok:true,service:'mk-foods-cloud',time:new Date().toISOString(),locations:store.size,authRequired:REQUIRE_AUTH,persistence:'file-backed'}),
 '/api/v1/sync/push':async req=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];if(events.length>1000)throw Error('TOO_MANY_EVENTS');const results=events.map(applyEvent);saveStore();return{ok:true,results,accepted:events.length}},
 '/api/v1/sync/pull':async req=>{const u=new URL(req.url,'http://localhost');const location=(u.searchParams.get('location')||'default').trim();const after=u.searchParams.get('after');let events=store.get(location)||[];if(after){const t=Date.parse(after);if(!Number.isFinite(t))throw Error('INVALID_AFTER');events=events.filter(e=>Date.parse(e.receivedAt)>t)}return{ok:true,events}},
 '/api/v1/reconcile':async req=>{const b=await body(req);const events=Array.isArray(b.events)?b.events:[];if(events.length>1000)throw Error('TOO_MANY_EVENTS');const results=events.map(applyEvent);saveStore();return{ok:true,results,pending:0}},
};
loadStore();
setInterval(cleanup,60_000).unref();
const server=http.createServer(async(req,res)=>{
  const rid=requestId(req);
  if(req.method==='OPTIONS')return json(res,204,{},rid);
  try{
    if(rateLimited(req))return json(res,429,{ok:false,error:'RATE_LIMITED'},rid);
    if(!authorized(req))return json(res,401,{ok:false,error:'UNAUTHORIZED'},rid);
    const route=req.url.split('?')[0];
    if(!routes[route])return json(res,404,{ok:false,error:'NOT_FOUND'},rid);
    if(req.method==='GET'){
      if(route!=='/api/v1/sync/pull'&&route!=='/api/v1/health')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},rid);
      return json(res,200,await routes[route](req),rid);
    }
    if(req.method==='POST'){
      const idem=String(req.headers['idempotency-key']||'').slice(0,256);
      if(idem&&idempotency.has(idem))return json(res,200,{...idempotency.get(idem).response,duplicate:true},rid);
      const response=await routes[route](req);
      if(idem)idempotency.set(idem,{at:Date.now(),response});
      return json(res,200,response,rid);
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},rid);
  }catch(e){
    const status=e.message==='BODY_TOO_LARGE'||e.message==='TOO_MANY_EVENTS'?413:e.message==='INVALID_JSON'||e.message==='INVALID_AFTER'||e.message==='LOCATION_ID_INVALID'?400:e.message==='PERSISTED_STORE_INVALID'?500:500;
    return json(res,status,{ok:false,error:e.message||'INTERNAL_ERROR',requestId:rid},rid);
  }
});
server.listen(PORT,()=>console.log(`MK Foods Cloud API listening on :${PORT} (${NODE_ENV})`));
