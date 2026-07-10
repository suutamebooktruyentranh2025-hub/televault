#!/usr/bin/env node
/**
 * Swap native binaries before electron-builder (cross-compile from macOS).
 * tdl ships prebuilds for all platforms — npmRebuild must stay false.
 * better-sqlite3 and prebuilt-tdlib need platform-specific artifacts in node_modules.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const electronVersion = require(path.join(root, 'node_modules/electron/package.json')).version;
const tdlibVersion = require(path.join(root, 'node_modules/prebuilt-tdlib/package.json')).version;

const target = process.argv[2];
if (!target || !['darwin', 'win32'].includes(target)) {
  console.error('Usage: node scripts/prepare-native.js <darwin|win32>');
  process.exit(1);
}

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

function prebuildSqlite(platform, arch) {
  const sqliteDir = path.join(root, 'node_modules/better-sqlite3');
  run(
    `npx prebuild-install --runtime electron --target ${electronVersion} --platform ${platform} --arch ${arch}`,
    sqliteDir,
  );
}

if (target === 'win32') {
  run(`npm install --force --ignore-scripts @prebuilt-tdlib/win32-x64@${tdlibVersion}`);
  prebuildSqlite('win32', 'x64');
} else {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  prebuildSqlite('darwin', arch);
}

console.log(`Prepared native modules for ${target} (Electron ${electronVersion})`);
