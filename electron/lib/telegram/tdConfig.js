const fs = require('fs');
const path = require('path');
const tdl = require('tdl');
const { getTdjson } = require('prebuilt-tdlib');

let configured = false;

/** Native libs are unpacked to app.asar.unpacked; require.resolve still points inside app.asar. */
function unwrapAsarNativePath(filePath) {
  if (typeof filePath !== 'string') return filePath;
  const unpacked = `${path.sep}app.asar.unpacked${path.sep}`;
  if (filePath.includes(unpacked)) return filePath;
  const asar = `${path.sep}app.asar${path.sep}`;
  if (filePath.includes(asar)) {
    return filePath.replace(asar, unpacked);
  }
  return filePath;
}

function resolveTdjsonPath() {
  if (process.env.TELEVAULT_TDJSON) {
    return process.env.TELEVAULT_TDJSON;
  }
  try {
    const tdjson = unwrapAsarNativePath(getTdjson());
    if (fs.existsSync(tdjson)) return tdjson;
  } catch {
    /* fall through */
  }
  if (process.platform === 'darwin') {
    const candidates = [
      '/opt/homebrew/opt/tdlib/lib/libtdjson.dylib',
      '/opt/homebrew/lib/libtdjson.dylib',
      '/usr/local/lib/libtdjson.dylib',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

function ensureTdlibConfigured() {
  if (configured) return;
  const tdjson = resolveTdjsonPath();
  if (tdjson) {
    tdl.configure({ tdjson, verbosityLevel: 1 });
  } else {
    tdl.configure({ verbosityLevel: 1 });
  }
  configured = true;
}

module.exports = { ensureTdlibConfigured };
