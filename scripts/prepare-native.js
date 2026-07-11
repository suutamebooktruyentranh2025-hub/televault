#!/usr/bin/env node
/**
 * Swap native binaries before electron-builder (cross-compile from macOS).
 * tdl ships prebuilds for all platforms — npmRebuild must stay false.
 * better-sqlite3 and prebuilt-tdlib need platform-specific artifacts in node_modules.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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
  const os = require('os');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdlib-win32-'));
  console.log('Installing win32-x64 to temp dir:', tempDir);
  run(`npm install --prefix "${tempDir}" --no-save --force --ignore-scripts @prebuilt-tdlib/win32-x64@${tdlibVersion} --os=win32 --cpu=x64`);
  
  const destDir = path.join(root, 'node_modules', '@prebuilt-tdlib', 'win32-x64');
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  
  // copy from tempDir
  const srcDir = path.join(tempDir, 'node_modules', '@prebuilt-tdlib', 'win32-x64');
  fs.cpSync(srcDir, destDir, { recursive: true });
  fs.rmSync(tempDir, { recursive: true, force: true });

  prebuildSqlite('win32', 'x64');
} else {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  prebuildSqlite('darwin', arch);
}

console.log(`Prepared native modules for ${target} (Electron ${electronVersion})`);
