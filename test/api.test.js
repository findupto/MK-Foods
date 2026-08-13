const fs=require('fs');
const path=require('path');
const api=fs.readFileSync(path.join(__dirname,'../cloud/openapi.yaml'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../cloud/server.js'),'utf8');
for(const x of ['/sync/push','/sync/pull','/reconcile','/health'])if(!api.includes(x)||!server.includes(x))throw new Error(`Cloud API route missing: ${x}`);
if(!api.includes('Idempotency-Key'))throw new Error('Idempotency contract missing');
if(!server.includes('seen'))throw new Error('Server idempotency store missing');
console.log('Cloud API contract checks passed.');
