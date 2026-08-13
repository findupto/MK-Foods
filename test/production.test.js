const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const banking = read('src/renderer/banking.js');
const production = read('src/renderer/production.js');
const tauri = read('src/renderer/tauri.js');
const index = read('src/renderer/index.html');

function assert(ok, msg) { if (!ok) throw new Error(msg); }

assert(index.includes('banking.js'), 'Banking screen is not loaded');
assert(index.includes('production.js'), 'Production safeguards are not loaded');
assert(banking.includes('paymentMerchantId'), 'Bank merchant configuration missing');
assert(banking.includes('paymentEnvironment'), 'Bank environment configuration missing');
assert(production.includes('pending_verification'), 'Digital payments must not be auto-settled');
assert(production.includes('bankReady'), 'Digital payment readiness guard missing');
assert(production.includes('const tax ='), 'Checkout tax calculation missing');
assert(!production.includes('cardNumber') && !production.includes('cvv'), 'Card PAN/CVV must not be stored in renderer');
assert(tauri.includes('discoverPrinters'), 'Printer discovery bridge missing');
assert(tauri.includes('connectPrinter'), 'Printer connection bridge missing');

console.log('Production safety checks passed.');
