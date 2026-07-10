const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const {
  encodeCaption,
  decodeCaption,
  dirMarker,
  copyEntry,
  isDir,
  K_TRASH_FOLDER,
  isTrashFolder,
  isInTrash,
  pathInTrash,
  pathFromTrash,
  uniqueVaultPath,
  planFolderRename,
  planFolderDelete,
  planTagRename,
  planTagDelete,
  resolvePathConflicts,
  normalizeFolderTags,
} = require('@televault/core');
const { inputMessageDocument, shouldDisableContentTypeDetection } = require('../telegram/tdApiBuilders');
const { TransferTask } = require('../transfer/transferQueue');

class FolderMoveException extends Error {
  /** @param {'intoDescendant'} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

class VaultService {
  /**
   * @param {{ client: import('tdl').Client, db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>, channel: import('../telegram/channelService').ChannelService, queue: import('../transfer/transferQueue').TransferQueue, chatId: number, onChange?: () => void }} opts
   */
  constructor({ client, db, channel, queue, chatId, onChange, onUploadDone }) {
    this.client = client;
    this.db = db;
    this.channel = channel;
    this.queue = queue;
    this.chatId = chatId;
    this.onChange = onChange || (() => {});
    this.onUploadDone = onUploadDone || null;
    this.queue.onStatusChange = (task) => {
      this._onTransferStatusChange(task);
      if (
        task.kind === 'upload' &&
        task.status === 'done' &&
        task.destPath &&
        typeof this.onUploadDone === 'function'
      ) {
        void this.onUploadDone(task.destPath);
      }
    };
    /** @type {Set<number>} */
    this._pendingTrashTempIds = new Set();
  }

  async handleMessageSendSucceeded(oldId, newId) {
    if (!this._pendingTrashTempIds.has(oldId)) return;
    this._pendingTrashTempIds.delete(oldId);
    if (newId > 0) await this.trashEntries([newId]);
  }

  handleMessageSendFailed(oldId) {
    this._pendingTrashTempIds.delete(oldId);
  }

  _onTransferStatusChange(task) {
    const pid = task.persistId;
    if (pid == null) return;
    if (task.status === 'done' || task.status === 'cancelled') this.db.transferRemove(pid);
    else if (task.status === 'failed') {
      this.db.transferUpdate(pid, {
        status: task.status,
        error: task.error ? String(task.error.message || task.error) : null,
      });
    } else if (task.status === 'running') {
      this.db.transferUpdate(pid, { status: 'running' });
    }
  }

  _tdId(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number.parseInt(v, 10) || -1;
    return -1;
  }

  async _editCaption(messageId, caption) {
    await this.client.invoke({
      _: 'editMessageCaption',
      chat_id: this.chatId,
      message_id: messageId,
      caption: { _: 'formattedText', text: caption },
    });
  }

  async _editMessageText(messageId, text) {
    await this.client.invoke({
      _: 'editMessageText',
      chat_id: this.chatId,
      message_id: messageId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text },
      },
    });
  }

  /** @param {import('@televault/core').VaultEntry} entry */
  async _syncEntryMetadata(entry) {
    const payload = encodeCaption(entry);
    if (isDir(entry)) await this._editMessageText(entry.messageId, payload);
    else await this._editCaption(entry.messageId, payload);
  }

  async renameFile(messageId, newPath) {
    const entry = this.db.getAll().find((e) => e.messageId === messageId);
    if (!entry) throw new Error('Entry not found');
    const updated = copyEntry(entry, { path: newPath });
    await this._syncEntryMetadata(updated);
    this.db.upsert(updated);
    this.onChange();
  }

  async ensureFolderMarker(folderPath, tags) {
    const existing = this.db.getAll().find((e) => isDir(e) && e.path === folderPath);
    if (existing) return existing;
    const normalized = normalizeFolderTags(tags);
    if (normalized.length === 0) return null;
    const marker = dirMarker({ messageId: 0, path: folderPath, tags: normalized });
    await this.client.invoke({
      _: 'sendMessage',
      chat_id: this.chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text: encodeCaption(marker) },
      },
    });
    return null;
  }

  async setFolderTags(folderPath, tags) {
    const normalized = normalizeFolderTags(tags);
    this.db.setFolderTags(folderPath, normalized);
    const marker = this.db.getAll().find((e) => isDir(e) && e.path === folderPath);
    if (marker) {
      const updated = copyEntry(marker, { tags: normalized });
      await this._syncEntryMetadata(updated);
      this.db.upsert(updated);
    } else if (normalized.length > 0) {
      await this.ensureFolderMarker(folderPath, normalized);
    }
    this.onChange();
  }

  async deleteEntries(messageIds) {
    if (messageIds.length === 0) return;
    await this.client.invoke({
      _: 'deleteMessages',
      chat_id: this.chatId,
      message_ids: messageIds,
      revoke: true,
    });
    for (const id of messageIds) this.db.delete(id);
    this.onChange();
  }

  async ensureTrashFolder() {
    const all = this.db.getAll();
    if (all.some((e) => isDir(e) && e.path === K_TRASH_FOLDER)) return;
    await this.createFolder(K_TRASH_FOLDER);
  }

  async trashEntries(messageIds) {
    if (messageIds.length === 0) return;
    await this.ensureTrashFolder();
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    for (const id of messageIds) {
      const entry = all.find((e) => e.messageId === id);
      if (!entry || isInTrash(entry.path)) continue;
      if (id < 0) {
        this._pendingTrashTempIds.add(id);
        continue;
      }
      const dest = uniqueVaultPath(pathInTrash(entry.path), paths);
      paths.push(dest);
      await this.renameFile(id, dest);
    }
  }

  async trashFolder(folder) {
    if (isTrashFolder(folder) || isInTrash(folder)) {
      await this.deleteFolderPermanently(folder);
      return;
    }
    await this.ensureTrashFolder();
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    const dest = uniqueVaultPath(pathInTrash(folder), paths);
    await this.renameFolder(folder, dest);
  }

  async deleteFolderPermanently(folder) {
    const steps = planFolderDelete(this.db.getAll(), folder);
    await this._runJournaled(steps.map((s) => ['delete', { messageId: s.messageId }]));
  }

  async restoreEntries(messageIds) {
    if (messageIds.length === 0) return;
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    for (const id of messageIds) {
      const entry = all.find((e) => e.messageId === id);
      if (!entry || !isInTrash(entry.path) || isDir(entry)) continue;
      const dest = uniqueVaultPath(pathFromTrash(entry.path), paths);
      paths.push(dest);
      await this.renameFile(id, dest);
    }
  }

  async restoreFolder(folder) {
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    let dest = uniqueVaultPath(pathFromTrash(folder), paths);
    if (!dest.endsWith('/')) dest = `${dest}/`;
    await this.renameFolder(folder, dest);
  }

  async createFolder(folderPath) {
    const marker = dirMarker({ messageId: 0, path: folderPath });
    await this.client.invoke({
      _: 'sendMessage',
      chat_id: this.chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text: encodeCaption(marker) },
      },
    });
  }

  checkDuplicate(sha256) {
    return this.db.findBySha(sha256);
  }

  async _runJournaled(steps) {
    const ids = steps.map(([op, args]) => this.db.journalAdd(op, args));
    for (let i = 0; i < steps.length; i += 1) {
      await this._applyJournalStep(steps[i][0], steps[i][1]);
      this.db.journalRemove(ids[i]);
    }
    this.onChange();
  }

  async _applyJournalStep(op, args) {
    switch (op) {
      case 'editCaption': {
        const messageId = args.messageId;
        const caption = args.caption;
        const decoded = decodeCaption(messageId, caption);
        if (decoded && isDir(decoded)) await this._editMessageText(messageId, caption);
        else await this._editCaption(messageId, caption);
        if (decoded) this.db.upsert(decoded);
        break;
      }
      case 'delete':
        await this.client.invoke({
          _: 'deleteMessages',
          chat_id: this.chatId,
          message_ids: [args.messageId],
          revoke: true,
        });
        this.db.delete(args.messageId);
        break;
      default:
        break;
    }
  }

  async resumePendingJournal() {
    for (const item of this.db.journalPending()) {
      try {
        await this._applyJournalStep(item.op, item.args);
        this.db.journalRemove(item.id);
      } catch (e) {
        const code = e?.code;
        if (code === 404 || code === 400) this.db.journalRemove(item.id);
        else throw e;
      }
    }
  }

  async renameFolder(from, to) {
    const all = this.db.getAll();
    const steps = planFolderRename(all, from, to);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    this.db.renameFolderTagsPath(from, to);
    await this._runJournaled(
      steps.map((s) => [
        'editCaption',
        {
          messageId: s.messageId,
          caption: encodeCaption(copyEntry(byId[s.messageId], { path: s.newPath })),
        },
      ]),
    );
  }

  async moveFolder(folder, destParent) {
    const name = folder.slice(0, -1).split('/').pop();
    let to = `${destParent}${name}/`;
    if (to === folder) return;
    if (to.startsWith(folder)) throw new FolderMoveException('intoDescendant');
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    if (paths.includes(to)) {
      to = uniqueVaultPath(to, paths);
      if (!to.endsWith('/')) to = `${to}/`;
    }
    await this.renameFolder(folder, to);
  }

  async moveFile(messageId, destFolder) {
    const entry = this.db.getAll().find((e) => e.messageId === messageId);
    if (!entry || isDir(entry)) throw new Error('Not a file');
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    let dest = `${destFolder}${name}`;
    if (paths.includes(dest)) dest = uniqueVaultPath(dest, paths);
    await this.renameFile(messageId, dest);
  }

  async renameTag(from, to) {
    const all = this.db.getAll();
    const steps = planTagRename(all, from, to);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    this.db.renameTagName(from, to);
    await this._runJournaled(
      steps.map((s) => [
        'editCaption',
        {
          messageId: s.messageId,
          caption: encodeCaption(copyEntry(byId[s.messageId], { tags: s.newTags })),
        },
      ]),
    );
  }

  async deleteTag(tag) {
    this.db.deleteTagName(tag);
    const all = this.db.getAll();
    const steps = planTagDelete(all, tag);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    await this._runJournaled(
      steps.map((s) => [
        'editCaption',
        {
          messageId: s.messageId,
          caption: encodeCaption(copyEntry(byId[s.messageId], { tags: s.newTags })),
        },
      ]),
    );
  }

  _sha256Of(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  _isUploadAlreadyOnVault(p) {
    const { localPath, destPath } = p;
    if (!localPath || !destPath || !fs.existsSync(localPath)) return false;
    const entry = this.db.getAll().find((e) => e.path === destPath && !isInTrash(e.path));
    if (!entry) return false;
    const sha = this._sha256Of(localPath);
    const size = fs.statSync(localPath).size;
    return entry.sha256 === sha && entry.size === size;
  }

  _isDownloadAlreadyComplete(entry) {
    if (!entry.localPath || !fs.existsSync(entry.localPath)) return false;
    const actual = this._sha256Of(entry.localPath);
    return actual === entry.sha256;
  }

  enqueueUpload(localPath, destPath, options = {}) {
    const label = path.basename(destPath);
    const size = fs.statSync(localPath).size;
    const persistId = this.db.transferAdd({
      kind: 'upload',
      label,
      localPath,
      destPath,
      size,
    });
    const task = new TransferTask({
      id: `up:${persistId}`,
      kind: 'upload',
      label,
      localPath,
      destPath,
      
      totalBytes: size,
      persistId,
      metadata: { vaultPath: destPath, ...(options.metadata || {}) },
      run: async (report, signal) => this._runUpload(localPath, destPath, report, signal),
    });
    const done = this.queue.add(task);
    return { task, done };
  }

  async _runUpload(localPath, destPath, report) {
    if (!fs.existsSync(localPath)) {
      throw new Error(`File không tồn tại — thử chọn lại: ${localPath}`);
    }
    const sha = this._sha256Of(localPath);
    const stat = fs.statSync(localPath);
    const entry = {
      messageId: 0,
      path: destPath,
      size: stat.size,
      sha256: sha,
      mtime: new Date(),
      tags: [],
    };
    this.channel.markUploadPath(destPath);
    let messageId = null;
    let tempId = null;
    try {
      const sent = await this.client.invoke({
        _: 'sendMessage',
        chat_id: this.chatId,
        input_message_content: inputMessageDocument({
          filePath: localPath,
          captionText: encodeCaption(entry),
          disableContentTypeDetection: shouldDisableContentTypeDetection(localPath),
        }),
      });
      tempId = this._tdId(sent.id ?? sent.message?.id);
      if (tempId < 0) throw new Error('sendMessage không trả message id');
      this.channel.markUploadPending(tempId);
      const uploadFileId = this.channel.tdFileIdFromMessage(
        /** @type {Record<string, unknown>} */ (sent.message ?? sent),
      );
      messageId = await this._awaitUploadComplete(tempId, report, uploadFileId);
      const msg = await this.client.invoke({
        _: 'getMessage',
        chat_id: this.chatId,
        message_id: messageId,
      });
      const indexed = this.channel.entryFromMessage(
        /** @type {Record<string, unknown>} */ (msg),
      );
      if (indexed) {
        this.db.upsert(indexed);
        this.onChange();
      }
    } finally {
      this.channel.clearUploadPath(destPath);
      if (tempId != null) this.channel.clearUploadPending(tempId, messageId);
    }
  }

  /** @param {number} tempMessageId @param {(f: number) => void} report @param {number | null} uploadFileId @returns {Promise<number>} */
  _awaitUploadComplete(tempMessageId, report, uploadFileId = null) {
    return new Promise((resolve, reject) => {
      let realMessageId = null;
      let uploadComplete = false;
      const timeout = setTimeout(() => {
        this.client.off('update', handler);
        reject(new Error('Upload timeout — kiểm tra kết nối mạng'));
      }, 30 * 60 * 1000);

      const tryFinish = () => {
        if (realMessageId != null && realMessageId > 0 && uploadComplete) {
          clearTimeout(timeout);
          this.client.off('update', handler);
          report(1);
          resolve(realMessageId);
        }
      };

      /** @param {Record<string, unknown>} u */
      const handler = (u) => {
        switch (u._) {
          case 'updateFile': {
            const file = /** @type {Record<string, unknown>} */ (u.file);
            if (uploadFileId != null && this._tdId(file.id) !== uploadFileId) break;
            const remote = /** @type {Record<string, unknown>} */ (file.remote || {});
            const size = Number(file.size) || 0;
            const up = Number(remote.uploaded_size) || 0;
            if (size > 0) report(Math.min(1, up / size));
            if (remote.is_uploading_completed) {
              uploadComplete = true;
              tryFinish();
            }
            break;
          }
          case 'updateMessageSendSucceeded': {
            if (this._tdId(u.old_message_id) === tempMessageId) {
              const msg = /** @type {Record<string, unknown>} */ (u.message || {});
              realMessageId = this._tdId(msg.id);
              tryFinish();
            }
            break;
          }
          case 'updateMessageSendFailed':
            if (this._tdId(u.old_message_id) === tempMessageId) {
              clearTimeout(timeout);
              this.client.off('update', handler);
              const err = /** @type {Record<string, unknown>} */ (u.error || {});
              reject(new Error(String(err.message || u.error_message || 'Gửi Telegram thất bại')));
            }
            break;
          default:
            break;
        }
      };
      this.client.on('update', handler);
    });
  }

  /** @deprecated use _awaitUploadComplete */
  _awaitSendSucceeded(tempMessageId, report, uploadFileId = null) {
    return this._awaitUploadComplete(tempMessageId, report, uploadFileId);
  }

  enqueueDownload(entry) {
    /** @type {(v: string) => void} */
    let resolvePath;
    /** @type {(e: Error) => void} */
    let rejectPath;
    const pathPromise = new Promise((resolve, reject) => {
      resolvePath = resolve;
      rejectPath = reject;
    });
    const label = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    const persistId = this.db.transferAdd({
      kind: 'download',
      label,
      messageId: entry.messageId,
      size: entry.size,
    });
    const task = new TransferTask({
      id: `down:${persistId}`,
      kind: 'download',
      label,
      messageId: entry.messageId,
      totalBytes: entry.size,
      persistId,
      metadata: { vaultPath: entry.path },
      run: async (report, signal) => this._runDownload(entry, report, resolvePath, rejectPath, signal),
    });
    const done = this.queue.add(task);
    return { task, done: pathPromise };
  }

  async _runDownload(entry, report, resolvePath, rejectPath, signal) {
    try {
      const msg = await this.client.invoke({
        _: 'getMessage',
        chat_id: this.chatId,
        message_id: entry.messageId,
      });
      const fileId = this.channel.tdFileIdFromMessage(msg);
      if (fileId == null || fileId < 0) {
        throw new Error('Tin nhắn không có file đính kèm');
      }
      this.db.setTdFileId(entry.messageId, fileId);

      const fileInfo = await this.client.invoke({ _: 'getFile', file_id: fileId });
      const cached = fileInfo.local || {};
      if (cached.is_downloading_completed && cached.path && fs.existsSync(cached.path)) {
        const actual = this._sha256Of(cached.path);
        if (actual !== entry.sha256) {
          throw new Error(`SHA256 không khớp — file có thể bị hỏng`);
        }
        this.db.setLocalPath(entry.messageId, cached.path);
        report(1);
        resolvePath(cached.path);
        return;
      }

      const localPath = await new Promise((resolve, reject) => {
        let aborted = false;
        const timeout = setTimeout(() => {
          this.client.off('update', handler);
          reject(new Error('Download timeout — kiểm tra kết nối mạng'));
        }, 30 * 60 * 1000);

        const onAbort = () => {
          aborted = true;
          void this.client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
          clearTimeout(timeout);
          this.client.off('update', handler);
          reject(new Error('Người dùng đã hủy quá trình tải'));
        };
        if (signal) {
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort);
        }

        /** @param {Record<string, unknown>} u */
        const handler = (u) => {
          if (u._ !== 'updateFile') return;
          const file = /** @type {Record<string, unknown>} */ (u.file);
          if (this._tdId(file.id) !== fileId) return;
          const local = /** @type {Record<string, unknown>} */ (file.local || {});
          const size = Number(file.size) || 0;
          const got = Number(local.downloaded_size) || 0;
          if (size > 0 && !aborted) report(Math.min(1, got / size));
          if (local.is_downloading_completed && local.path && !aborted) {
            clearTimeout(timeout);
            this.client.off('update', handler);
            if (signal) signal.removeEventListener('abort', onAbort);
            resolve(String(local.path));
          }
        };
        this.client.on('update', handler);
        void this.client.invoke({
          _: 'downloadFile',
          file_id: fileId,
          priority: 32,
          synchronous: false,
        });
      });

      if (!fs.existsSync(localPath)) {
        throw new Error(`TDLib cache không tồn tại: ${localPath}`);
      }
      const actual = this._sha256Of(localPath);
      if (actual !== entry.sha256) {
        throw new Error(`SHA256 không khớp — file có thể bị hỏng`);
      }
      this.db.setLocalPath(entry.messageId, localPath);
      report(1);
      resolvePath(localPath);
    } catch (e) {
      rejectPath(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  async restorePendingTransfers({ autoStart }) {
    for (const p of this.db.transfersPending()) {
      if (p.status === 'cancelled') {
        this.db.transferRemove(p.id);
        continue;
      }
      if (p.status === 'running') this.db.transferUpdate(p.id, { status: 'queued' });

      if (p.kind === 'upload') {
        if (!p.localPath || !p.destPath) {
          this.db.transferRemove(p.id);
          continue;
        }
        if (!fs.existsSync(p.localPath)) {
          this.db.transferUpdate(p.id, { status: 'failed', error: 'File không tồn tại — thử chọn lại' });
          this.queue.restorePaused(this._taskFromPending(p, 'failed'));
          continue;
        }
        if (this._isUploadAlreadyOnVault(p)) {
          this.db.transferRemove(p.id);
          continue;
        }
        const task = this._taskFromPending(
          p,
          p.status === 'failed' ? 'failed' : 'paused',
        );
        this.queue.restorePaused(task);
        if (autoStart && p.status !== 'failed') {
          this.db.transferUpdate(p.id, { status: 'queued' });
          void this.queue.startTask(task);
        }
        continue;
      }

      if (p.kind === 'download' && p.messageId != null) {
        const entry = this.db.getAll().find((e) => e.messageId === p.messageId);
        if (!entry) {
          this.db.transferRemove(p.id);
          continue;
        }
        if (this._isDownloadAlreadyComplete(entry)) {
          this.db.transferRemove(p.id);
          continue;
        }
        const task = this._taskFromPending(
          p,
          p.status === 'failed' ? 'failed' : 'paused',
          entry,
        );
        this.queue.restorePaused(task);
        if (autoStart && p.status !== 'failed') {
          this.db.transferUpdate(p.id, { status: 'queued' });
          void this.queue.startTask(task);
        }
      }
    }
    const needsPanel = this.queue.tasks.some(
      (t) =>
        t.status === 'queued' ||
        t.status === 'running' ||
        t.status === 'paused' ||
        t.status === 'failed',
    );
    if (!needsPanel) this.queue.clearFinished();
  }

  _taskFromPending(p, status, entry) {
    const task = new TransferTask({
      id: p.kind === 'upload' ? `up:${p.id}` : `down:${p.id}`,
      kind: p.kind,
      label: p.label,
      localPath: p.localPath,
      destPath: p.destPath,
      messageId: p.messageId,
      totalBytes: p.size,
      persistId: p.id,
      run: async () => {},
    });
    task.status = status;
    if (p.error) task.error = new Error(p.error);
    if (p.kind === 'upload' && p.localPath && p.destPath) {
      task.run = (report) => this._runUpload(p.localPath, p.destPath, report);
    } else if (entry) {
      let resolvePath;
      let rejectPath;
      const pathPromise = new Promise((res, rej) => {
        resolvePath = res;
        rejectPath = rej;
      });
      task.run = (report) => this._runDownload(entry, report, resolvePath, rejectPath);
    }
    return task;
  }

  retryTransfer(task) {
    this.queue.removeTask(task.id);
    if (task.persistId != null) this.db.transferRemove(task.persistId);
    if (task.kind === 'upload' && task.localPath && task.destPath) {
      this.enqueueUpload(task.localPath, task.destPath);
    } else if (task.kind === 'download' && task.messageId != null) {
      const entry = this.db.getAll().find((e) => e.messageId === task.messageId);
      if (entry) this.enqueueDownload(entry);
    }
  }

  resumeTransfer(task) {
    if (task.persistId != null) this.db.transferUpdate(task.persistId, { status: 'queued' });
    void this.queue.startTask(task);
  }

  clearFinishedTransfers() {
    for (const t of this.queue.tasks) {
      if ((t.status === 'failed' || t.status === 'done') && t.persistId != null) {
        this.db.transferRemove(t.persistId);
      }
    }
    this.queue.clearFinished();
  }

  async resolveConflictsNow() {
    const fixes = resolvePathConflicts(this.db.getAll());
    for (const fix of fixes) {
      try {
        const updated = copyEntry(fix.entry, { path: fix.newPath });
        await this._editCaption(fix.entry.messageId, encodeCaption(updated));
        this.db.upsert(updated);
      } catch (e) {
        const code = e?.code;
        if (code === 404 || code === 400) this.db.delete(fix.entry.messageId);
        else throw e;
      }
    }
    this.onChange();
  }
}

module.exports = { VaultService, FolderMoveException };
