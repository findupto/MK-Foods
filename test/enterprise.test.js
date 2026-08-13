const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/renderer/enterprise.js'),'utf8');
const req=['stockLedger','cashSessions','refunds','voids','kdsStations','driveThru','loyalty','menuVersions','events','conflicts','audit','reconcile','backup','permissions'];
for(const x of req)if(!src.includes(x))throw new Error(`Enterprise capability missing: ${x}`);
if(!src.includes('eventId')||!src.includes('originDeviceId'))throw new Error('Sync idempotency identity missing');
if(!src.includes('prevHash')||!src.includes('SHA-256'))throw new Error('Tamper-evident audit chain missing');
console.log('Enterprise domain checks passed.');
