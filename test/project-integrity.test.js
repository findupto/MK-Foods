const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const renderer = path.join(root, 'src', 'renderer');
const index = read('src/renderer/index.html');
const scripts = [...index.matchAll(/<script\s+src=["']\.\/([^"']+\.js)["']/g)].map(m => m[1]);
const styles = [...index.matchAll(/<link\s+rel=["']stylesheet["']\s+href=["']\.\/([^"']+\.css)["']/g)].map(m => m[1]);

for (const file of scripts) {
  const full = path.join(renderer, file);
  assert(fs.existsSync(full), `index.html references missing JavaScript asset: ${file}`);
  const result = cp.spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  assert(result.status === 0, `JavaScript syntax error in ${file}: ${result.stderr || result.stdout}`);
}
for (const file of styles) {
  assert(fs.existsSync(path.join(renderer, file)), `index.html references missing stylesheet: ${file}`);
}

const allRendererJs = fs.readdirSync(renderer).filter(f => f.endsWith('.js'));
for (const file of allRendererJs) {
  const result = cp.spawnSync(process.execPath, ['--check', path.join(renderer, file)], { encoding: 'utf8' });
  assert(result.status === 0, `Unloaded renderer JavaScript has syntax errors: ${file}: ${result.stderr || result.stdout}`);
}

const printManager = read('src/renderer/print-manager.js');
assert(printManager.includes('window.printReceipt'), 'Receipt print bridge is missing');
assert(printManager.includes('queue(order)'), 'Receipt printing must enqueue the original order');
assert(!printManager.includes("window.open('','_blank'"), 'Receipt printing must not open popup windows');

const tauri = read('src/renderer/tauri.js');
assert(tauri.includes("safe('print_thermal'"), 'Thermal printer bridge is missing');
assert(tauri.includes("safe('discover_printers'"), 'Windows printer discovery bridge is missing');
assert(tauri.includes("safe('connect_printer'"), 'Windows printer connection bridge is missing');

console.log(`Project integrity passed: ${scripts.length} indexed scripts, ${styles.length} stylesheets, ${allRendererJs.length} renderer JS files syntax-checked.`);
