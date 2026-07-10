class TransferTask {
  /**
   * @param {{ id: string, kind: string, label: string, run: (report: (f: number) => void) => Promise<void> }} opts
   */
  constructor({ id, kind, label, run, localPath, destPath, messageId, totalBytes, persistId, metadata }) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.run = run;
    this.localPath = localPath ?? null;
    this.destPath = destPath ?? null;
    this.messageId = messageId ?? null;
    this.totalBytes = totalBytes ?? null;
    this.persistId = persistId ?? null;
    this.metadata = metadata ?? null;
    this.status = 'queued';
    this.error = null;
    this.lastProgress = 0;
    this.abortController = new AbortController();
    /** @type {Set<(f: number) => void>} */
    this._listeners = new Set();
  }

  /** @param {(f: number) => void} fn */
  onProgress(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** @param {number} f */
  _report(f) {
    this.lastProgress = f;
    for (const fn of this._listeners) fn(f);
  }
}

class TransferQueue {
  /**
   * @param {{ maxConcurrent?: number, baseBackoffMs?: number, maxAttempts?: number, onChange?: () => void }} [opts]
   */
  constructor(opts = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? 2;
    this.baseBackoffMs = opts.baseBackoffMs ?? 2000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.onChange = opts.onChange || (() => {});
    this.onStatusChange = opts.onStatusChange || null;
    /** @type {TransferTask[]} */
    this.tasks = [];
    /** @type {Array<[TransferTask, () => void]>} */
    this._waiting = [];
    this._running = 0;
    this._lastProgressNotifyAt = 0;
  }

  _touchProgressNotify() {
    const now = Date.now();
    if (now - this._lastProgressNotifyAt >= 200) {
      this._lastProgressNotifyAt = now;
      this.onChange();
    }
  }

  setMaxConcurrent(n) {
    this.maxConcurrent = Math.max(1, Math.min(5, n));
    this._pump();
  }

  /** @param {TransferTask} task */
  add(task) {
    return new Promise((resolve) => {
      this.tasks.push(task);
      this._waiting.push([task, resolve]);
      this.onChange();
      this._pump();
    });
  }

  restorePaused(task) {
    if (task.status === 'queued') task.status = 'paused';
    this.tasks.push(task);
    this.onChange();
  }

  removeTask(taskId) {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.onChange();
  }

  startTask(task) {
    if (task.status === 'paused' || task.status === 'failed') {
      task.error = null;
      task.lastProgress = 0;
      task.status = 'queued';
    }
    if (task.status !== 'queued') return Promise.resolve();
    return new Promise((resolve) => {
      this._waiting.push([task, resolve]);
      this._notify(task);
      this._pump();
    });
  }

  _notify(task) {
    this.onChange();
    if (this.onStatusChange) this.onStatusChange(task);
  }

  cancel(taskId) {
    let canceled = false;
    for (const [task] of this._waiting) {
      if (task.id === taskId && task.status === 'queued') {
        task.status = 'cancelled';
        this._notify(task);
        canceled = true;
      }
    }
    if (!canceled) {
      const runningTask = this.tasks.find((t) => t.id === taskId && t.status === 'running');
      if (runningTask) {
        runningTask.status = 'cancelled';
        runningTask.abortController.abort();
        this._notify(runningTask);
      }
    }
  }

  clearFinished() {
    this.tasks = this.tasks.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'failed',
    );
    this.onChange();
  }

  snapshot() {
    return this.tasks.map((t) => ({
      id: t.id,
      kind: t.kind,
      label: t.label,
      status: t.status,
      progress: t.lastProgress,
      error: t.error ? String(t.error.message || t.error) : null,
      metadata: t.metadata,
    }));
  }

  _pump() {
    while (this._running < this.maxConcurrent && this._waiting.length > 0) {
      const [task, done] = this._waiting.shift();
      if (task.status === 'cancelled') {
        done();
        continue;
      }
      this._running += 1;
      this._execute(task).finally(() => {
        this._running -= 1;
        done();
        this._notify(task);
        this._pump();
      });
    }
  }

  /** @param {TransferTask} task */
  async _execute(task) {
    task.status = 'running';
    this._notify(task);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (task.status === 'cancelled') return;
      try {
        await task.run((f) => {
          task._report(f);
          this._touchProgressNotify();
        }, task.abortController.signal);
        
        if (task.status === 'cancelled') return;
        task.status = 'done';
        return;
      } catch (e) {
        if (task.status === 'cancelled') return;
        task.error = e;
        if (attempt === this.maxAttempts) {
          task.status = 'failed';
          return;
        }
        await new Promise((r) => setTimeout(r, this.baseBackoffMs * attempt));
      }
    }
  }
}

module.exports = { TransferQueue, TransferTask };
