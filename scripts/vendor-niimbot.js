const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'node_modules', '@mmote', 'niimbluelib', 'dist', 'umd', 'niimbluelib.min.js');
const targetDir = path.join(root, 'src', 'renderer', 'vendor');
const target = path.join(targetDir, 'niimbluelib.min.js');

if (!fs.existsSync(source)) {
  console.warn('[MK Foods] Niimbot bundle not installed yet; skipping vendor copy.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log('[MK Foods] Niimbot BLE runtime vendored into src/renderer/vendor/.');
