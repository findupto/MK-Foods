const fs=require('fs');
const path=require('path');
const api=fs.readFileSync(path.join(__dirname,'../cloud/openapi.yaml'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../cloud/server.js'),'utf8');
for(const x of ['/sync/push','/sync/pull','/reconcile','/health'])if(!api.includes(x)||!server.includes(x))throw new Error(`Cloud API route missing: ${x}`);
if(!api.includes('Idempotency-Key'))throw new Error('Idempotency contract missing');
for(const x of ['seen','MK_FOODS_REQUIRE_AUTH','MK_FOODS_DATA_DIR','saveStore','loadStore','timingSafeEqual','x-request-id','x-content-type-options'])if(!server.includes(x))throw new Error(`Enterprise cloud control missing: ${x}`);
if(!server.includes("a.length===b.length&&crypto.timingSafeEqual(a,b)"))throw new Error('Constant-time API key comparison missing');
console.log('Cloud API enterprise hardening checks passed.');
