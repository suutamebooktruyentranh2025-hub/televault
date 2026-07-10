const path = require('path');
const fs = require('fs');
const { ChannelService } = require('../telegram/channelService');
const { openIndexDb } = require('../db/indexDb');
const {
  listFolder,
  sortFolderListing,
  folderMtime,
  folderSize,
  entryName,
  isDir,
  effectiveTagsForPath,
} = require('@televault/core');

class SharedVaultManager {
  /**
   * @param {{ client: import('tdl').Client, ownChatId: number, userDataPath: string, onChange: () => void }} opts
   */
  constructor(opts) {
    this.client = opts.client;
    this.ownChatId = opts.ownChatId;
    this.userDataPath = opts.userDataPath;
    this.onChange = opts.onChange;
    /** @type {Array<{ chatId: number, title: string }>} */
    this._vaults = [];
    /** @type {Map<number, { db: ReturnType<typeof openIndexDb>, channel: ChannelService, scanned: boolean }>} */
    this._instances = new Map();
  }

  async discover() {
    const found = await ChannelService.findAllVaultChannels(this.client, this.ownChatId);
    this._vaults = found;
    // Clean up instances for vaults no longer accessible
    for (const [chatId, inst] of this._instances) {
      if (!found.some((v) => v.chatId === chatId)) {
        inst.channel.dispose();
        inst.db.close();
        this._instances.delete(chatId);
      }
    }
    this.onChange();
  }

  getDiscoveredVaults() {
    return this._vaults.map((v) => ({ ...v }));
  }

  /** @param {number} chatId */
  _ensureInstance(chatId) {
    if (this._instances.has(chatId)) return this._instances.get(chatId);
    const dir = path.join(this.userDataPath, 'shared-vaults', String(chatId));
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, 'index.db');
    const db = openIndexDb(dbPath);
    const channel = new ChannelService(this.client, db);
    const inst = { db, channel, scanned: false };
    this._instances.set(chatId, inst);
    return inst;
  }

  /** @param {number} chatId */
  async scanVault(chatId) {
    const inst = this._ensureInstance(chatId);
    if (inst.scanned) return;
    inst.channel.listenUpdates(chatId);
    await inst.channel.scanHistory(chatId);
    inst.scanned = true;
    inst.channel.onChange(() => this.onChange());
    this.onChange();
  }

  /**
   * @param {number} chatId
   * @param {string} folder
   * @param {string} sortField
   * @param {string} sortDirection
   */
  getFiles(chatId, folderPath) {
    const inst = this._instances.get(chatId);
    if (!inst) return [];
    const { filesInVaultFolder } = require('./fileExport');
    return filesInVaultFolder(inst.db.getAll(), folderPath);
  }

  getListing(chatId, folder = '/', sortField = 'name', sortDirection = 'asc') {
    const inst = this._instances.get(chatId);
    if (!inst) return { ok: false, error: 'not_scanned', folders: [], files: [] };
    const all = inst.db.getAll();
    const listing = listFolder(all, folder);
    const sorted = sortFolderListing(listing, all, folder, {
      field: sortField,
      direction: sortDirection,
    });
    const folderItems = sorted.folders.map((name) => {
      const folderPath = `${folder}${name}/`;
      const mtime = folderMtime(all, folderPath);
      return { name, mtime: mtime.toISOString(), size: folderSize(all, folderPath) };
    });
    const folderTags = inst.db.folderTagsIndex();
    const files = sorted.files.map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      size: e.size,
      sha256: e.sha256,
      mtime: e.mtime.toISOString(),
      tags: effectiveTagsForPath(e.path, folderTags),
      localPath: null,
      isDir: isDir(e),
    }));
    return { ok: true, folders: folderItems, files };
  }

  /**
   * @param {number} chatId
   * @param {string} query
   */
  search(chatId, query) {
    const inst = this._instances.get(chatId);
    if (!inst) return { ok: false, files: [] };
    const folderTags = inst.db.folderTagsIndex();
    const files = inst.db.search({ query, tags: [] }).map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      size: e.size,
      sha256: e.sha256,
      mtime: e.mtime.toISOString(),
      tags: effectiveTagsForPath(e.path, folderTags),
      localPath: null,
      isDir: isDir(e),
    }));
    return { ok: true, files };
  }

  /** @param {number} chatId */
  getStats(chatId) {
    const inst = this._instances.get(chatId);
    if (!inst) return { ok: false, count: 0 };
    return { ok: true, count: inst.db.listVisibleFileCount() };
  }

  /**
   * Returns the entry info so the caller can download via TDLib directly.
   * @param {number} chatId
   * @param {number} messageId
   */
  getDownloadInfo(chatId, messageId) {
    const inst = this._instances.get(chatId);
    if (!inst) return null;
    const entry = inst.db.getByMessageId(messageId);
    if (!entry) return null;
    return { entry, chatId };
  }

  dispose() {
    for (const [, inst] of this._instances) {
      inst.channel.dispose();
      inst.db.close();
    }
    this._instances.clear();
    this._vaults = [];
  }
}

module.exports = { SharedVaultManager };
