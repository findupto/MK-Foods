const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const workflow = read('src/renderer/order-workflow.js');
const index = read('src/renderer/index.html');
function assert(ok, msg) { if (!ok) throw new Error(msg); }
assert(index.includes('order-workflow.js'), 'Order workflow script is not loaded');
for (const key of ['collectOrder','forwardKitchen','markPrepared','markCooked','sendToCounter','collectCash','showOrderTracking']) assert(workflow.includes(`window.${key}`), `${key} method missing`);
for (const key of ['collectedBy','preparedBy','cookedBy','counterBy','cashCollectedBy']) assert(workflow.includes(key), `${key} tracking missing`);
for (const key of ['Shake Kitchen','Biryani Kitchen','Fastfood Kitchen']) assert(workflow.includes(key), `${key} routing missing`);
assert(workflow.includes('SALE RECEIPT'), 'Final sale receipt missing');
assert(workflow.includes('customerHistorySearch'), 'Customer history search missing');
console.log('Staged order workflow tests passed.');
