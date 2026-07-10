const chokidar = require('chokidar');
const path = require('path');

class LocalWatcher {
  /**
   * @param {{
   *   folder: string,
   *   debounceMs?: number,
   *   onBatch: (changes: Array<{ type: string, relPath: string, fullPath: string }>) => void,
   *   ignoreInitial?: boolean,
   * }} opts
   */
  constructor(opts) {
    this.folder = opts.folder;
    this.debounceMs = opts.debounceMs ?? 30000;
    this.onBatch = opts.onBatch;
    this.ignoreInitial = opts.ignoreInitial !== false;
    this.awaitWriteFinish = opts.awaitWriteFinish !== undefined ? opts.awaitWriteFinish : { stabilityThreshold: 2000, pollInterval: 500 };
    /** @type {import('chokidar').FSWatcher | null} */
    this._watcher = null;
    /** @type {Array<{ type: string, relPath: string, fullPath: string }>} */
    this._buffer = [];
    this._timer = null;
    this._paused = false;
  }

  async start() {
    if (this._watcher) return;
    return new Promise((resolve) => {
      this._watcher = chokidar.watch(this.folder, {
        persistent: true,
        ignoreInitial: this.ignoreInitial,
        awaitWriteFinish: this.awaitWriteFinish,
        ignorePermissionErrors: true,
      });

      this._watcher.on('add', (fp) => this._push('add', fp));
      this._watcher.on('change', (fp) => this._push('change', fp));
      this._watcher.on('unlink', (fp) => this._push('unlink', fp));
      this._watcher.on('addDir', (fp) => {
        if (fp !== this.folder) this._push('addDir', fp);
      });
      this._watcher.on('unlinkDir', (fp) => this._push('unlinkDir', fp));
      this._watcher.on('ready', () => resolve());
    });
  }

  async stop() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this._buffer = [];
    if (this._watcher) {
      await this._watcher.close();
      this._watcher = null;
    }
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  _push(type, fullPath) {
    if (this._paused) return;
    const relPath = path.relative(this.folder, fullPath).replace(/\\/g, '/');
    // If there's an older event for the same path, keep only the latest
    const samePathIdx = this._buffer.findIndex((c) => c.relPath === relPath);
    if (samePathIdx >= 0) this._buffer.splice(samePathIdx, 1);
    this._buffer.push({ type, relPath, fullPath });
    this._resetTimer();
  }

  _resetTimer() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), this.debounceMs);
  }

  _flush() {
    this._timer = null;
    if (this._buffer.length === 0) return;
    const batch = [...this._buffer];
    this._buffer = [];
    this.onBatch(batch);
  }
}

module.exports = { LocalWatcher };
