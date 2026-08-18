const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const banking = read('src/renderer/banking.js');
const production = read('src/renderer/production.js');
const workflowUi = read('src/renderer/order-workflow.js');
const printManager = read('src/renderer/print-manager.js');
const printers = read('src/renderer/printers.js');
const tauri = read('src/renderer/tauri.js');
const index = read('src/renderer/index.html');
const pkg = JSON.parse(read('package.json'));
const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargoText = read('src-tauri/Cargo.toml');
const workflow = read('.github/workflows/build-windows.yml');
const windowsBuild = read('build-windows.bat');
const windowsPowerShell = read('build-windows.ps1');
const rustPrinter = read('src-tauri/src/printer.rs');

function assert(ok, msg) { if (!ok) throw new Error(msg); }

assert(index.includes('banking.js'), 'Banking screen is not loaded');
assert(index.includes('production.js'), 'Production safeguards are not loaded');
assert(index.includes('order-workflow.js'), 'Staged order workflow is not loaded');
assert(!printManager.includes("window.open('','_blank'"), 'Print Manager must not open receipt popups');
assert(tauri.includes('discoverPrinters'), 'Printer discovery bridge missing');
assert(tauri.includes('connectPrinter'), 'Printer connection bridge missing');
assert(printers.includes('data-action="connect-bt-method"'), 'Bluetooth devices must expose a clickable connection action');
assert(printers.includes('data-bt-name='), 'Bluetooth connection action must retain device name');
assert(printers.includes('data-bt-mac='), 'Bluetooth connection action must retain device MAC when available');
assert(printers.includes('data-bt-com='), 'Bluetooth connection action must retain SPP COM port when available');
assert(printers.includes('Direct SPP'), 'Bluetooth direct transport fallback missing');
assert(printers.includes('Windows Queue'), 'Windows printer queue fallback missing');
assert(printers.includes('findWindowsFallback'), 'Windows queue matching fallback missing');
assert(rustPrinter.includes('Get-CimInstance Win32_PnPEntity'), 'Bluetooth PnP fallback discovery missing');
assert(rustPrinter.includes('BTHENUM*'), 'BTHENUM device discovery missing');
assert(rustPrinter.includes('bluetooth_mac_from_instance'), 'Bluetooth MAC extraction missing');
assert(pkg.version === tauriConfig.version, 'Package version must match Tauri application version');
assert(pkg.version === '2.3.0', 'Application release version must be 2.3.0');
assert(cargoText.match(/version\s*=\s*"([^"]+)"/)[1] === pkg.version, 'Cargo package version must match application version');
assert(workflow.includes('npm test'), 'Windows build must run automated tests');
assert(!workflow.includes('cache: npm'), 'Windows build must not require a lockfile just to configure npm cache');
assert(windowsBuild.includes('build-windows.ps1'), 'Windows launcher must call the PowerShell build');
assert(windowsPowerShell.includes('Microsoft Visual Studio\\Installer\\vswhere.exe'), 'PowerShell build must detect Visual Studio');
assert(windowsPowerShell.includes('Find-VisualStudio'), 'PowerShell build must have Visual Studio discovery');
assert(windowsPowerShell.includes('Activate-DirectMsvc'), 'PowerShell build must have direct MSVC activation');
assert(windowsPowerShell.includes('vcvarsall.bat'), 'PowerShell build must have vcvarsall fallback');
assert(windowsPowerShell.includes('VsDevCmd.bat'), 'PowerShell build must have VsDevCmd fallback');
assert(windowsPowerShell.includes('Try-BatchMsvc'), 'PowerShell build must automatically try fallback activation');
assert(windowsPowerShell.includes('aarch64-pc-windows-msvc'), 'Windows build must keep ARM64 target support');
assert(windowsPowerShell.includes('i686-pc-windows-msvc'), 'Windows build must keep x86 target support');

console.log('Production safety, printer connectivity, version consistency, staged workflow, non-popup printing, and Windows build checks passed.');
