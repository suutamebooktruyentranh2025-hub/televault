const Database = require('better-sqlite3');
const {
  isInTrash,
  effectiveTagsForPath,
  entryMatchesSearch,
} = require('@televault/core');

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files(
      message_id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      mtime TEXT NOT NULL,
      local_path TEXT,
      last_used TEXT,
      td_file_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);
    CREATE TABLE IF NOT EXISTS file_tags(
      message_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY(message_id, tag)
    );
    CREATE TABLE IF NOT EXISTS folder_tags(
      folder_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY(folder_path, tag)
    );
    CREATE TABLE IF NOT EXISTS journal(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op TEXT NOT NULL,
      args TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transfers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      local_path TEXT,
      dest_path TEXT,
      message_id INTEGER,
      size INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_config(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_manifest(
      rel_path TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      mtime TEXT NOT NULL,
      side TEXT NOT NULL DEFAULT 'both'
    );
    CREATE TABLE IF NOT EXISTS gdrive_tokens(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gdrive_subscriptions(
      drive_id TEXT PRIMARY KEY,
      drive_path TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      is_folder INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS gdrive_manifest(
      drive_file_id TEXT PRIMARY KEY,
      drive_path TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      drive_modified_time TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gdrive_state(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gdrive_sync_errors(
      drive_file_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      drive_path TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      size INTEGER,
      modified_time TEXT,
      error_message TEXT,
      failed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS gdrive_sync_queue(
      drive_file_id TEXT PRIMARY KEY,
      file_name TEXT,
      drive_path TEXT,
      vault_path TEXT,
      size INTEGER,
      modified_time TEXT,
      added_at TEXT,
      retry_count INTEGER DEFAULT 0
    );
  `);

  // Migration: add retry_count if missing (for existing databases)
  try {
    db.prepare('SELECT retry_count FROM gdrive_sync_queue LIMIT 0').get();
  } catch {
    db.exec('ALTER TABLE gdrive_sync_queue ADD COLUMN retry_count INTEGER DEFAULT 0');
  }
}

function rowToEntry(db, r) {
  const tagRows = db.prepare('SELECT tag FROM file_tags WHERE message_id = ?').all(r.message_id);
  return {
    messageId: r.message_id,
    path: r.path,
    size: r.size,
    sha256: r.sha256,
    mtime: new Date(r.mtime),
    tags: tagRows.map((t) => t.tag),
    localPath: r.local_path,
  };
}

/**
 * @param {string} dbPath
 */
function openIndexDb(dbPath) {
  const db = new Database(dbPath);
  createSchema(db);

  function folderTagsIndex() {
    const rows = db.prepare('SELECT folder_path, tag FROM folder_tags ORDER BY folder_path, tag').all();
    /** @type {Record<string, string[]>} */
    const index = {};
    for (const r of rows) {
      if (!index[r.folder_path]) index[r.folder_path] = [];
      index[r.folder_path].push(r.tag);
    }
    return index;
  }

  return {
    close() {
      db.close();
    },

    upsert(entry) {
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO files(message_id, path, size, sha256, mtime, local_path)
           VALUES (@messageId, @path, @size, @sha256, @mtime, @localPath)
           ON CONFLICT(message_id) DO UPDATE SET
             path=excluded.path, size=excluded.size, sha256=excluded.sha256,
             mtime=excluded.mtime, local_path=excluded.local_path`,
        ).run({
          messageId: entry.messageId,
          path: entry.path,
          size: entry.size,
          sha256: entry.sha256,
          mtime: entry.mtime.toISOString(),
          localPath: entry.localPath ?? null,
        });

        db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(entry.messageId);
        if (entry.path.endsWith('/')) {
          db.prepare('DELETE FROM folder_tags WHERE folder_path = ?').run(entry.path);
          for (const tag of entry.tags || []) {
            db.prepare('INSERT OR REPLACE INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(
              entry.path,
              tag,
            );
            db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(
              entry.messageId,
              tag,
            );
          }
        }
      });
      tx();
    },

    delete(messageId) {
      db.transaction(() => {
        db.prepare('DELETE FROM files WHERE message_id = ?').run(messageId);
        db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(messageId);
      })();
    },

    getAll() {
      const rows = db.prepare('SELECT * FROM files WHERE message_id > 0').all();
      return rows.map((r) => rowToEntry(db, r));
    },

    getByMessageId(messageId) {
      const r = db.prepare('SELECT * FROM files WHERE message_id = ?').get(messageId);
      return r ? rowToEntry(db, r) : null;
    },

    countEntries() {
      return db.prepare('SELECT COUNT(*) AS c FROM files').get().c;
    },

    reconcileToMessageIds(validIds) {
      const rows = db.prepare('SELECT message_id FROM files').all();
      db.transaction(() => {
        for (const r of rows) {
          if (!validIds.has(r.message_id)) {
            db.prepare('DELETE FROM files WHERE message_id = ?').run(r.message_id);
            db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(r.message_id);
          }
        }
      })();
    },

    getVaultChatId() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('vault_chat_id');
      return row ? Number.parseInt(row.value, 10) : null;
    },

    setVaultChatId(chatId) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'vault_chat_id',
        String(chatId),
      );
    },

    getLastMessageId() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('last_message_id');
      return row ? Number.parseInt(row.value, 10) : 0;
    },

    setLastMessageId(id) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'last_message_id',
        String(id),
      );
    },

    deleteTemporaryMessageIds() {
      db.transaction(() => {
        db.prepare('DELETE FROM file_tags WHERE message_id < 0').run();
        db.prepare('DELETE FROM files WHERE message_id < 0').run();
      })();
      this.purgeStaleJournal();
    },

    listVisibleFileCount() {
      return db
        .prepare(
          `SELECT COUNT(*) AS c FROM files
           WHERE path NOT LIKE '/Rác/%' AND path NOT LIKE '%/'`,
        )
        .get().c;
    },

    setFolderTags(folderPath, tags) {
      db.transaction(() => {
        db.prepare('DELETE FROM folder_tags WHERE folder_path = ?').run(folderPath);
        for (const t of tags) {
          db.prepare('INSERT INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(folderPath, t);
        }
        const marker = db.prepare('SELECT message_id FROM files WHERE path = ? LIMIT 1').get(folderPath);
        if (marker) {
          db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(marker.message_id);
          for (const t of tags) {
            db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(
              marker.message_id,
              t,
            );
          }
        }
      })();
    },

    folderTagsIndex,

    allTagNames() {
      return Object.keys(this.foldersByTag()).sort((a, b) => a.localeCompare(b));
    },

    /** Folders that directly carry each tag (excludes trash). */
    foldersByTag() {
      /** @type {Record<string, string[]>} */
      const byTag = {};
      const add = (folderPath, tag) => {
        if (!tag || isInTrash(folderPath)) return;
        if (!byTag[tag]) byTag[tag] = [];
        if (!byTag[tag].includes(folderPath)) byTag[tag].push(folderPath);
      };

      for (const [folderPath, tags] of Object.entries(folderTagsIndex())) {
        for (const tag of tags) add(folderPath, tag);
      }

      for (const entry of this.getAll()) {
        if (!entry.path.endsWith('/')) continue;
        for (const tag of entry.tags || []) add(entry.path, tag);
      }

      for (const tag of Object.keys(byTag)) {
        byTag[tag].sort((a, b) => a.localeCompare(b));
      }
      return byTag;
    },

    /** Backfill folder_tags rows from dir marker entries (file_tags on folder paths). */
    reconcileFolderTagsFromMarkers() {
      for (const entry of this.getAll()) {
        if (!entry.path.endsWith('/') || isInTrash(entry.path)) continue;
        const markerTags = [...(entry.tags || [])].sort();
        const existing = [...(folderTagsIndex()[entry.path] || [])].sort();
        if (markerTags.join('\0') === existing.join('\0')) continue;
        this.setFolderTags(entry.path, entry.tags || []);
      }
    },

    renameFolderTagsPath(from, to) {
      const rows = db.prepare('SELECT folder_path, tag FROM folder_tags WHERE folder_path LIKE ?').all(`${from}%`);
      db.transaction(() => {
        for (const r of rows) {
          const newPath = to + r.folder_path.slice(from.length);
          db.prepare('DELETE FROM folder_tags WHERE folder_path = ? AND tag = ?').run(
            r.folder_path,
            r.tag,
          );
          db.prepare('INSERT OR IGNORE INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(
            newPath,
            r.tag,
          );
        }
      })();
    },

    renameTagName(from, to) {
      db.transaction(() => {
        const folderRows = db.prepare('SELECT folder_path FROM folder_tags WHERE tag = ?').all(from);
        for (const r of folderRows) {
          db.prepare('DELETE FROM folder_tags WHERE folder_path = ? AND tag = ?').run(r.folder_path, from);
          db.prepare('INSERT OR IGNORE INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(
            r.folder_path,
            to,
          );
        }
        const fileRows = db.prepare('SELECT message_id FROM file_tags WHERE tag = ?').all(from);
        for (const r of fileRows) {
          db.prepare('DELETE FROM file_tags WHERE message_id = ? AND tag = ?').run(r.message_id, from);
          db.prepare('INSERT OR IGNORE INTO file_tags(message_id, tag) VALUES (?, ?)').run(
            r.message_id,
            to,
          );
        }
      })();
    },

    deleteTagName(tag) {
      db.transaction(() => {
        db.prepare('DELETE FROM folder_tags WHERE tag = ?').run(tag);
        db.prepare('DELETE FROM file_tags WHERE tag = ?').run(tag);
      })();
    },

    rekeyMessageId(oldId, newId) {
      if (oldId === newId) return;
      db.transaction(() => {
        const row = db.prepare('SELECT * FROM files WHERE message_id = ?').get(oldId);
        if (!row) return;
        db.prepare('DELETE FROM files WHERE message_id = ?').run(oldId);
        db.prepare(
          `INSERT OR REPLACE INTO files(message_id, path, size, sha256, mtime, local_path, last_used, td_file_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newId,
          row.path,
          row.size,
          row.sha256,
          row.mtime,
          row.local_path,
          row.last_used,
          row.td_file_id,
        );
        const tagRows = db.prepare('SELECT tag FROM file_tags WHERE message_id = ?').all(oldId);
        db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(oldId);
        for (const t of tagRows) {
          db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(newId, t.tag);
        }
      })();
    },

    search({ query, tags = [] } = {}) {
      const trimmedQuery = query?.trim();
      const hasQuery = Boolean(trimmedQuery);
      const folderTags = folderTagsIndex();
      let results = this.getAll().filter((e) => !e.path.endsWith('/') && !isInTrash(e.path));

      if (tags.length > 0) {
        results = results.filter((e) => {
          const eff = effectiveTagsForPath(e.path, folderTags);
          return tags.every((t) => eff.includes(t));
        });
      }

      if (hasQuery) {
        results = results.filter((e) =>
          entryMatchesSearch(e.path, effectiveTagsForPath(e.path, folderTags), trimmedQuery),
        );
      } else if (tags.length === 0) {
        return [];
      }

      results.sort((a, b) => a.path.localeCompare(b.path));
      return results;
    },

    allTags() {
      const folderTags = folderTagsIndex();
      /** @type {Record<string, number>} */
      const counts = {};
      for (const e of this.getAll()) {
        if (e.path.endsWith('/') || isInTrash(e.path)) continue;
        for (const t of effectiveTagsForPath(e.path, folderTags)) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    },

    folderCountForTag(tag) {
      const folderTags = folderTagsIndex();
      return Object.values(folderTags).filter((tags) => tags.includes(tag)).length;
    },

    findBySha(sha256) {
      const r = db.prepare('SELECT * FROM files WHERE sha256 = ? LIMIT 1').get(sha256);
      return r ? rowToEntry(db, r) : null;
    },

    setLocalPath(messageId, localPath) {
      db.prepare('UPDATE files SET local_path = ? WHERE message_id = ?').run(localPath, messageId);
    },

    touchLastUsed(messageId) {
      db.prepare('UPDATE files SET last_used = ? WHERE message_id = ?').run(
        new Date().toISOString(),
        messageId,
      );
    },

    setTdFileId(messageId, tdFileId) {
      db.prepare('UPDATE files SET td_file_id = ? WHERE message_id = ?').run(tdFileId, messageId);
    },

    getCacheLimitBytes() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('cache_limit');
      return row ? Number.parseInt(row.value, 10) : 2 * 1024 * 1024 * 1024;
    },

    setCacheLimitBytes(bytes) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'cache_limit',
        String(bytes),
      );
    },

    getSaveAsDirectory() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('save_as_dir');
      return row?.value || null;
    },

    setSaveAsDirectory(dir) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run('save_as_dir', dir);
    },

    clearSaveAsDirectory() {
      db.prepare('DELETE FROM kv WHERE key = ?').run('save_as_dir');
    },

    getSetting(key, defaultValue = null) {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
      return row ? row.value : defaultValue;
    },

    setSetting(key, value) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(key, value);
    },

    journalAdd(op, args) {
      const r = db.prepare('INSERT INTO journal(op, args) VALUES (?, ?)').run(op, JSON.stringify(args));
      return Number(r.lastInsertRowid);
    },

    journalPending() {
      return db
        .prepare('SELECT id, op, args FROM journal ORDER BY id')
        .all()
        .map((r) => ({ id: r.id, op: r.op, args: JSON.parse(r.args) }));
    },

    journalRemove(id) {
      db.prepare('DELETE FROM journal WHERE id = ?').run(id);
    },

    purgeStaleJournal() {
      for (const item of this.journalPending()) {
        const mid = item.args.messageId;
        if (typeof mid === 'number' && mid < 0) this.journalRemove(item.id);
      }
    },

    getAutoResumeTransfers() {
      return this.getSetting('auto_resume_transfers', '1') === '1';
    },

    setAutoResumeTransfers(enabled) {
      this.setSetting('auto_resume_transfers', enabled ? '1' : '0');
    },

    transferAdd({ kind, label, localPath, destPath, messageId, size = 0 }) {
      const r = db
        .prepare(
          `INSERT INTO transfers(kind, label, status, local_path, dest_path, message_id, size, created_at)
           VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`,
        )
        .run(kind, label, localPath ?? null, destPath ?? null, messageId ?? null, size, new Date().toISOString());
      return Number(r.lastInsertRowid);
    },

    transferUpdate(id, { status, error } = {}) {
      const patch = [];
      const args = [];
      if (status != null) {
        patch.push('status = ?');
        args.push(status);
      }
      if (error != null) {
        patch.push('error = ?');
        args.push(error);
      }
      if (patch.length === 0) return;
      args.push(id);
      db.prepare(`UPDATE transfers SET ${patch.join(', ')} WHERE id = ?`).run(...args);
    },

    transferRemove(id) {
      db.prepare('DELETE FROM transfers WHERE id = ?').run(id);
    },

    transfersPending() {
      return db.prepare('SELECT * FROM transfers ORDER BY id').all().map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        status: r.status,
        localPath: r.local_path,
        destPath: r.dest_path,
        messageId: r.message_id,
        size: r.size,
        error: r.error,
        createdAt: r.created_at,
      }));
    },

    getSyncConfig() {
      const get = (key, defaultValue) => {
        const row = db.prepare('SELECT value FROM sync_config WHERE key = ?').get(key);
        return row ? row.value : defaultValue;
      };
      return {
        syncFolder: get('sync_folder', null),
        syncMode: get('sync_mode', 'upload-only'),
        syncEnabled: get('sync_enabled', 'false') === 'true',
        syncVaultFolder: get('sync_vault_folder', '/Sync/'),
      };
    },

    setSyncConfig({ syncFolder, syncMode, syncEnabled, syncVaultFolder }) {
      const set = (key, value) => {
        if (value != null) {
          db.prepare('INSERT OR REPLACE INTO sync_config(key, value) VALUES (?, ?)').run(key, String(value));
        }
      };
      db.transaction(() => {
        if (syncFolder !== undefined) set('sync_folder', syncFolder);
        if (syncMode !== undefined) set('sync_mode', syncMode);
        if (syncEnabled !== undefined) set('sync_enabled', syncEnabled ? 'true' : 'false');
        if (syncVaultFolder !== undefined) set('sync_vault_folder', syncVaultFolder);
      })();
    },

    syncManifestUpsert(relPath, { sha256, mtime, side }) {
      db.prepare(
        'INSERT OR REPLACE INTO sync_manifest(rel_path, sha256, mtime, side) VALUES (?, ?, ?, ?)'
      ).run(relPath, sha256, mtime, side);
    },

    syncManifestGet(relPath) {
      const r = db.prepare('SELECT * FROM sync_manifest WHERE rel_path = ?').get(relPath);
      return r ? { relPath: r.rel_path, sha256: r.sha256, mtime: r.mtime, side: r.side } : null;
    },

    syncManifestDelete(relPath) {
      db.prepare('DELETE FROM sync_manifest WHERE rel_path = ?').run(relPath);
    },

    syncManifestAll() {
      return db.prepare('SELECT * FROM sync_manifest ORDER BY rel_path').all().map(r => ({
        relPath: r.rel_path, sha256: r.sha256, mtime: r.mtime, side: r.side,
      }));
    },

    syncManifestClear() {
      db.prepare('DELETE FROM sync_manifest').run();
    },

    // --- Google Drive ---
    gdriveTokenGet(key) {
      const row = db.prepare('SELECT value FROM gdrive_tokens WHERE key = ?').get(key);
      return row?.value ?? null;
    },
    gdriveTokenSet(key, value) {
      db.prepare('INSERT OR REPLACE INTO gdrive_tokens(key, value) VALUES (?, ?)').run(key, value);
    },
    gdriveTokenDelete(key) {
      db.prepare('DELETE FROM gdrive_tokens WHERE key = ?').run(key);
    },
    gdriveTokensClear() {
      db.prepare('DELETE FROM gdrive_tokens').run();
    },

    gdriveSubscriptionAdd({ driveId, drivePath, vaultPath, isFolder }) {
      db.prepare(
        'INSERT OR REPLACE INTO gdrive_subscriptions(drive_id, drive_path, vault_path, is_folder, enabled) VALUES (?, ?, ?, ?, 1)'
      ).run(driveId, drivePath, vaultPath, isFolder ? 1 : 0);
    },
    gdriveSubscriptionRemove(driveId) {
      db.prepare('DELETE FROM gdrive_subscriptions WHERE drive_id = ?').run(driveId);
    },
    gdriveSubscriptionSetEnabled(driveId, enabled) {
      db.prepare('UPDATE gdrive_subscriptions SET enabled = ? WHERE drive_id = ?').run(enabled ? 1 : 0, driveId);
    },
    gdriveSubscriptionsAll() {
      return db.prepare('SELECT * FROM gdrive_subscriptions ORDER BY drive_path').all().map(r => ({
        driveId: r.drive_id,
        drivePath: r.drive_path,
        vaultPath: r.vault_path,
        isFolder: r.is_folder === 1,
        enabled: r.enabled === 1,
      }));
    },

    gdriveManifestUpsert({ driveFileId, drivePath, vaultPath, sha256, size, driveModifiedTime }) {
      db.prepare(
        `INSERT OR REPLACE INTO gdrive_manifest(drive_file_id, drive_path, vault_path, sha256, size, drive_modified_time, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(driveFileId, drivePath, vaultPath, sha256, size, driveModifiedTime, new Date().toISOString());
    },
    gdriveManifestGet(driveFileId) {
      const r = db.prepare('SELECT * FROM gdrive_manifest WHERE drive_file_id = ?').get(driveFileId);
      if (!r) return null;
      return {
        driveFileId: r.drive_file_id, drivePath: r.drive_path, vaultPath: r.vault_path,
        sha256: r.sha256, size: r.size, driveModifiedTime: r.drive_modified_time, syncedAt: r.synced_at,
      };
    },
    gdriveManifestAll() {
      return db.prepare('SELECT * FROM gdrive_manifest ORDER BY drive_path').all().map(r => ({
        driveFileId: r.drive_file_id, drivePath: r.drive_path, vaultPath: r.vault_path,
        sha256: r.sha256, size: r.size, driveModifiedTime: r.drive_modified_time, syncedAt: r.synced_at,
      }));
    },
    gdriveManifestRecent() {
      return db.prepare('SELECT * FROM gdrive_manifest ORDER BY synced_at DESC').all().map(r => ({
        driveFileId: r.drive_file_id, drivePath: r.drive_path, vaultPath: r.vault_path,
        sha256: r.sha256, size: r.size, driveModifiedTime: r.drive_modified_time, syncedAt: r.synced_at,
      }));
    },
    gdriveManifestDelete(driveFileId) {
      db.prepare('DELETE FROM gdrive_manifest WHERE drive_file_id = ?').run(driveFileId);
    },
    gdriveManifestClear() {
      db.prepare('DELETE FROM gdrive_manifest').run();
    },

    gdriveSyncErrorAdd({ driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, errorMessage }) {
      db.prepare(
        `INSERT OR REPLACE INTO gdrive_sync_errors(drive_file_id, file_name, drive_path, vault_path, size, modified_time, error_message, failed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, errorMessage, new Date().toISOString());
    },
    gdriveSyncErrorRemove(driveFileId) {
      db.prepare('DELETE FROM gdrive_sync_errors WHERE drive_file_id = ?').run(driveFileId);
    },
    gdriveSyncErrorsAll() {
      return db.prepare('SELECT * FROM gdrive_sync_errors ORDER BY failed_at DESC').all().map(r => ({
        driveFileId: r.drive_file_id, fileName: r.file_name, drivePath: r.drive_path, vaultPath: r.vault_path,
        size: r.size, modifiedTime: r.modified_time, errorMessage: r.error_message, failedAt: r.failed_at,
      }));
    },
    gdriveSyncErrorsClear() {
      db.prepare('DELETE FROM gdrive_sync_errors').run();
    },

    gdriveStateGet(key, defaultValue = null) {
      const row = db.prepare('SELECT value FROM gdrive_state WHERE key = ?').get(key);
      return row?.value ?? defaultValue;
    },
    gdriveStateSet(key, value) {
      db.prepare('INSERT OR REPLACE INTO gdrive_state(key, value) VALUES (?, ?)').run(key, value);
    },

    gdriveSyncQueueAdd({ driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, retryCount = 0 }) {
      db.prepare(`
        INSERT OR REPLACE INTO gdrive_sync_queue(
          drive_file_id, file_name, drive_path, vault_path, size, modified_time, added_at, retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).run(driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, retryCount);
    },
    gdriveSyncQueueGetNext() {
      const r = db.prepare('SELECT * FROM gdrive_sync_queue ORDER BY added_at ASC LIMIT 1').get();
      if (!r) return null;
      return {
        driveFileId: r.drive_file_id,
        fileName: r.file_name,
        drivePath: r.drive_path,
        vaultPath: r.vault_path,
        size: r.size,
        modifiedTime: r.modified_time,
        retryCount: r.retry_count || 0,
      };
    },

    gdriveSyncQueueGetAll() {
      return db.prepare('SELECT * FROM gdrive_sync_queue ORDER BY added_at ASC').all().map(r => ({
        driveFileId: r.drive_file_id,
        fileName: r.file_name,
        drivePath: r.drive_path,
        vaultPath: r.vault_path,
        size: r.size,
        modifiedTime: r.modified_time,
      }));
    },

    gdriveSyncQueueRemove(driveFileId) {
      db.prepare('DELETE FROM gdrive_sync_queue WHERE drive_file_id = ?').run(driveFileId);
    },
    gdriveSyncQueueCount() {
      const row = db.prepare('SELECT count(*) as count FROM gdrive_sync_queue').get();
      return row ? row.count : 0;
    },
    gdriveSyncQueueClear() {
      db.prepare('DELETE FROM gdrive_sync_queue').run();
    },
    gdriveSyncQueueIncrementRetry(driveFileId) {
      db.prepare('UPDATE gdrive_sync_queue SET retry_count = retry_count + 1 WHERE drive_file_id = ?').run(driveFileId);
    },
  };
}

module.exports = { openIndexDb, isInTrash };
