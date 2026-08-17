const fs = require('fs');
const assert = require('assert');

const rust = fs.readFileSync('src-tauri/src/printer.rs', 'utf8');
const ui = fs.readFileSync('src/renderer/printers.js', 'utf8');
const consoleUi = fs.readFileSync('src/renderer/printer-console.js', 'utf8');
const printManager = fs.readFileSync('src/renderer/print-manager.js', 'utf8');
const docs = fs.readFileSync('docs/BLUETOOTH-PRINTERS.md', 'utf8');

assert(rust.includes('__BLUETOOTH_DISCOVER__'), 'Bluetooth discovery command missing');
assert(rust.includes('BTHENUM'), 'Windows BTHENUM discovery missing');
assert(rust.includes('Win32_SerialPort'), 'Bluetooth SPP COM discovery missing');
assert(rust.includes('__BLUETOOTH_RAW__|'), 'Direct Bluetooth SPP transport missing');
assert(rust.includes('__BLUETOOTH_COM__|'), 'Bluetooth COM transport missing');
assert(rust.includes('__NETWORK_RAW__|'), 'Network RAW transport missing');
assert(rust.includes('WriteFile'), 'Raw COM write transport missing');
assert(rust.includes('windows-raw'), 'Windows RAW spooler transport missing');
assert(/for\s+attempt\s+in\s+1\.\.\=3/.test(rust), 'Bluetooth retry loop missing');
assert(/attempt\s*<\s*3/.test(rust), 'Bluetooth retry backoff missing');

assert(ui.includes('bluetooth-spp'), 'Direct SPP UI route missing');
assert(ui.includes('bluetooth-com'), 'SPP COM UI route missing');
assert(ui.includes('windows-spooler'), 'Windows spooler fallback UI missing');
assert(ui.includes('manualBluetoothConnect'), 'Manual Bluetooth fallback UI missing');
assert(ui.includes('Connect & Test'), 'Printer connection validation action missing');

assert(consoleUi.includes('views.printers=render'), 'Reliable printer console must own the final printer view');
assert(consoleUi.includes('Network RAW (Port 9100)'), 'Network RAW printer UI missing');
assert(consoleUi.includes('Bluetooth Thermal Devices'), 'Bluetooth thermal UI missing');
assert(printManager.includes('printerRoute'), 'Print Center must resolve the configured printer transport');
assert(printManager.includes('__BLUETOOTH_RAW__|'), 'Print Center Bluetooth SPP route missing');
assert(printManager.includes('__BLUETOOTH_COM__|'), 'Print Center Bluetooth COM route missing');
assert(printManager.includes('__NETWORK_RAW__|'), 'Print Center Network RAW route missing');

assert(docs.includes('Windows PnP / BTHENUM'), 'Discovery documentation missing');
assert(docs.includes('Bluetooth SPP virtual COM'), 'COM transport documentation missing');
assert(docs.includes('Windows RAW spooler'), 'Spooler transport documentation missing');

console.log('printer contract checks passed');
