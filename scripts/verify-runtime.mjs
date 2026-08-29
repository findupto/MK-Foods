import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(new URL('..', import.meta.url).pathname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const deps = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {})
};

const forbidden = ['electron', 'electron-builder', 'electron-forge', 'vite', 'vite-plugin-electron'];
const found = forbidden.filter((name) => Object.hasOwn(deps, name));

const scriptText = Object.values(pkg.scripts ?? {}).join(' ');
for (const token of ['electron .', 'electron:dev', 'vite --host', 'vite dev']) {
  if (scriptText.includes(token)) found.push(`script:${token}`);
}

const required = ['@tauri-apps/cli'];
const missing = required.filter((name) => !Object.hasOwn(deps, name));

const nodeMajor = Number(process.versions.node.split('.')[0]);
const supportedNode = nodeMajor >= 20 && nodeMajor < 25;

if (!supportedNode || found.length || missing.length) {
  console.error('\n[MK Foods] Desktop runtime configuration check failed.');
  if (!supportedNode) console.error(`[MK Foods] Node ${process.versions.node} is unsupported. Use Node 20-24 LTS.`);
  if (found.length) console.error(`[MK Foods] Electron/Vite contamination detected: ${found.join(', ')}`);
  if (missing.length) console.error(`[MK Foods] Missing required Tauri dependency: ${missing.join(', ')}`);
  console.error('[MK Foods] This project is Tauri 2. Do not start it with Electron or Vite directly.');
  process.exit(1);
}

console.log(`[MK Foods] Runtime OK: Node ${process.versions.node}, Tauri CLI ${deps['@tauri-apps/cli']}.`);
console.log('[MK Foods] Electron/Vite contamination check: clean.');
