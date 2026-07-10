const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { LocalWatcher } = require('../localWatcher');

function tempDirPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lw-test-'));
}

test('emits batched changes after debounce', async () => {
  const tmpDir = tempDirPath();
  const batches = [];
  const watcher = new LocalWatcher({
    folder: tmpDir,
    debounceMs: 200,
    awaitWriteFinish: false,
    onBatch: (changes) => batches.push(changes),
  });
  await watcher.start();

  try {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
    // Wait for debounce
    await new Promise(r => setTimeout(r, 600));

    assert.ok(batches.length >= 1);
    const allChanges = batches.flat();
    const addEvent = allChanges.find(c => c.relPath === 'a.txt' && c.type === 'add');
    assert.ok(addEvent);
    assert.equal(addEvent.type, 'add');
  } finally {
    await watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('detects file deletion', async () => {
  const tmpDir = tempDirPath();
  fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'data');
  const batches = [];
  const watcher = new LocalWatcher({
    folder: tmpDir,
    debounceMs: 200,
    awaitWriteFinish: false,
    onBatch: (changes) => batches.push(changes),
    ignoreInitial: false,
  });
  await watcher.start();
  await new Promise(r => setTimeout(r, 100));

  try {
    fs.unlinkSync(path.join(tmpDir, 'b.txt'));
    await new Promise(r => setTimeout(r, 600));

    const allChanges = batches.flat();
    const unlinkEvent = allChanges.find(c => c.relPath === 'b.txt' && c.type === 'unlink');
    assert.ok(unlinkEvent);
    assert.equal(unlinkEvent.type, 'unlink');
  } finally {
    await watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

if (process.versions.electron) {
  setTimeout(() => {
    require('electron').app.quit();
  }, 500);
}
