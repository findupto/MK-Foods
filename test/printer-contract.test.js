const fs = require('fs');
const assert = require('assert');

const rust = fs.readFileSync('src-tauri/src/printer.rs', 'utf8');
const ui = fs.readFileSync('src/renderer/printers.js', 'utf8');
const docs = fs.readFileSync('docs/BLUETOOTH-PRINTERS.md', 'utf8');

assert(rust.includes('__BLUETOOTH_DISCOVER__'), 'Bluetooth discovery command missing');
assert(rust.includes('BTHENUM'), 'Windows BTHENUM discovery missing');
assert(rust.includes('Win32_SerialPort'), 'Bluetooth SPP COM discovery missing');
assert(rust.includes('__BLUETOOTH_RAW__|'), 'Direct Bluetooth SPP transport missing');
assert(rust.includes('__BLUETOOTH_COM__|'), 'Bluetooth COM transport missing');
assert(rust.includes('WriteFile'), 'Raw COM write transport missing');
assert(rust.includes('windows-raw'), 'Windows RAW spooler transport missing');

assert(ui.includes('bluetooth-spp'), 'Direct SPP UI route missing');
assert(ui.includes('bluetooth-com'), 'SPP COM UI route missing');
assert(ui.includes('windows-spooler'), 'Windows spooler fallback UI route missing');
assert(ui.includes('manualBluetoothConnect'), 'Manual Bluetooth fallback UI missing');
assert(ui.includes('Connect & Test'), 'Printer connection validation action missing');

assert(docs.includes('Windows PnP / BTHENUM'), 'Discovery documentation missing');
assert(docs.includes('Bluetooth SPP virtual COM'), 'COM transport documentation missing');
assert(docs.includes('Windows RAW spooler'), 'Spooler transport documentation missing');

console.log('printer contract checks passed');
