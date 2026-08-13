const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const banking = read('src/renderer/banking.js');
const production = read('src/renderer/production.js');
const tauri = read('src/renderer/tauri.js');
const index = read('src/renderer/index.html');
const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/build-windows.yml');

function assert(ok, msg) { if (!ok) throw new Error(msg); }

assert(index.includes('banking.js'), 'Banking screen is not loaded');
assert(index.includes('production.js'), 'Production safeguards are not loaded');
assert(banking.includes('paymentMerchantId'), 'Bank merchant configuration missing');
assert(banking.includes('paymentEnvironment'), 'Bank environment configuration missing');
assert(production.includes('pending_verification'), 'Digital payments must not be auto-settled');
assert(production.includes('bankReady'), 'Digital payment readiness guard missing');
assert(production.includes('const tax ='), 'Checkout tax calculation missing');
assert(production.includes('deliveryFee'), 'Delivery fee calculation missing');
assert(production.includes('Not enough stock'), 'Checkout stock guard missing');
assert(production.includes('posTotals'), 'POS subtotal/tax/total display missing');
assert(production.includes('customerId'), 'Customer must be attached to a sale when selected');
assert(production.includes('tableId'), 'Table assignment must be retained on a sale');
assert(production.includes('counterId'), 'Counter assignment must be retained on a sale');
assert(production.includes('cashCollectedBy'), 'Cashier responsibility must be retained on a sale');
assert(!production.includes('cardNumber') && !production.includes('cvv'), 'Card PAN/CVV must not be stored in renderer');
assert(tauri.includes('discoverPrinters'), 'Printer discovery bridge missing');
assert(tauri.includes('connectPrinter'), 'Printer connection bridge missing');
assert(pkg.version === '2.0.0', 'Package version must match Tauri application version');
assert(workflow.includes('npm test'), 'Windows build must run automated tests');
assert(!workflow.includes('cache: npm'), 'Windows build must not require a lockfile just to configure npm cache');

console.log('Production safety and POS workflow checks passed.');
