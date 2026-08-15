const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const banking = read('src/renderer/banking.js');
const production = read('src/renderer/production.js');
const workflowUi = read('src/renderer/order-workflow.js');
const tauri = read('src/renderer/tauri.js');
const index = read('src/renderer/index.html');
const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/build-windows.yml');
const windowsBuild = read('build-windows.bat');

function assert(ok, msg) { if (!ok) throw new Error(msg); }

assert(index.includes('banking.js'), 'Banking screen is not loaded');
assert(index.includes('production.js'), 'Production safeguards are not loaded');
assert(index.includes('order-workflow.js'), 'Staged order workflow is not loaded');
assert(banking.includes('paymentMerchantId'), 'Bank merchant configuration missing');
assert(banking.includes('paymentEnvironment'), 'Bank environment configuration missing');
assert(production.includes('pending_verification'), 'Digital payments must not be auto-settled');
assert(production.includes('bankReady'), 'Digital payment readiness guard missing');
// Keep this check implementation-focused rather than depending on one exact declaration style.
// Checkout must calculate a non-negative tax from the taxable amount and configured tax rate.
assert(/tax\s*=\s*taxable\s*\*\s*taxRate\s*\/\s*100/.test(production), 'Checkout tax calculation missing');
assert(/taxable\s*=\s*Math\.max\(0\s*,\s*subtotal\s*-\s*discount\)/.test(production), 'Checkout taxable amount calculation missing');
assert(/taxRate\s*=\s*Math\.max\(0\s*,\s*num\(db\?\.settings\?\.tax\)\)/.test(production), 'Checkout tax rate configuration missing');
assert(production.includes('deliveryFee'), 'Delivery fee calculation missing');
assert(production.includes('Not enough stock'), 'Checkout stock guard missing');
assert(production.includes('posTotals'), 'POS subtotal/tax/total display missing');
assert(production.includes('customerId'), 'Customer must be attached to a sale when selected');
assert(production.includes('tableId'), 'Table assignment must be retained on a sale');
assert(production.includes('counterId'), 'Counter assignment must be retained on a sale');
assert(production.includes('cashCollectedBy'), 'Cashier responsibility must be retained on a sale');
assert(!production.includes('cardNumber') && !production.includes('cvv'), 'Card PAN/CVV must not be stored in renderer');
assert(workflowUi.includes('collectedBy'), 'Order collector tracking missing');
assert(workflowUi.includes('preparedBy'), 'Order preparer tracking missing');
assert(workflowUi.includes('cookedBy'), 'Cook tracking missing');
assert(workflowUi.includes('cashCollectedBy'), 'Cash collector tracking missing');
assert(workflowUi.includes('Shake Kitchen'), 'Shake kitchen routing missing');
assert(workflowUi.includes('Biryani Kitchen'), 'Biryani kitchen routing missing');
assert(workflowUi.includes('Fastfood Kitchen'), 'Fastfood kitchen routing missing');
assert(workflowUi.includes('SALE RECEIPT'), 'Final sale receipt missing');
assert(workflowUi.includes('customerHistorySearch'), 'Customer history search missing');
assert(tauri.includes('discoverPrinters'), 'Printer discovery bridge missing');
assert(tauri.includes('connectPrinter'), 'Printer connection bridge missing');
assert(pkg.version === '2.0.0', 'Package version must match Tauri application version');
assert(workflow.includes('npm test'), 'Windows build must run automated tests');
assert(!workflow.includes('cache: npm'), 'Windows build must not require a lockfile just to configure npm cache');
assert(windowsBuild.includes('Microsoft Visual Studio\\Installer\\vswhere.exe'), 'Windows build must detect Visual Studio');
assert(windowsBuild.includes('VsDevCmd.bat'), 'Windows build must initialize the MSVC environment');
assert(windowsBuild.includes('aarch64-pc-windows-msvc'), 'Windows build must keep ARM64 target support');
assert(windowsBuild.includes('i686-pc-windows-msvc'), 'Windows build must keep x86 target support');

console.log('Production safety and staged order workflow checks passed.');
