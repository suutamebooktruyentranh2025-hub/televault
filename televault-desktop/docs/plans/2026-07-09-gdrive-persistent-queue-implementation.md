# GDrive Persistent Sync Queue Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Create a persistent queue for GDrive sync using SQLite to allow resuming sync across restarts and updating the queue on manual scans.

**Architecture:** Add a `gdrive_sync_queue` table in `indexDb.js`. Modify `gdriveSyncService.js` to push files to this table instead of an in-memory array, and have a background worker continuously poll and process files from this table. Upon app startup, the worker will automatically resume if there are pending files.

**Tech Stack:** Node.js, better-sqlite3

---

### Task 1: Create Database Schema for Sync Queue

**Files:**
- Modify: `electron/lib/db/indexDb.js`

**Step 1: Write DB Schema and Methods**
```javascript
// Add inside constructor
db.prepare(`
  CREATE TABLE IF NOT EXISTS gdrive_sync_queue(
    drive_file_id TEXT PRIMARY KEY,
    file_name TEXT,
    drive_path TEXT,
    vault_path TEXT,
    size INTEGER,
    modified_time TEXT,
    added_at TEXT
  )
`).run();

// Add methods
gdriveSyncQueueAdd({ driveFileId, fileName, drivePath, vaultPath, size, modifiedTime }) {
  db.prepare(`
    INSERT OR REPLACE INTO gdrive_sync_queue(
      drive_file_id, file_name, drive_path, vault_path, size, modified_time, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(driveFileId, fileName, drivePath, vaultPath, size, modifiedTime);
}

gdriveSyncQueueGetNext() {
  return db.prepare('SELECT * FROM gdrive_sync_queue ORDER BY added_at ASC LIMIT 1').get();
}

gdriveSyncQueueRemove(driveFileId) {
  db.prepare('DELETE FROM gdrive_sync_queue WHERE drive_file_id = ?').run(driveFileId);
}

gdriveSyncQueueCount() {
  const row = db.prepare('SELECT count(*) as count FROM gdrive_sync_queue').get();
  return row ? row.count : 0;
}
```

**Step 2: Commit**
```bash
git add electron/lib/db/indexDb.js
git commit -m "feat(gdrive): add gdrive_sync_queue table and db methods"
```

### Task 2: Refactor gdriveSyncService to Use DB Queue

**Files:**
- Modify: `electron/lib/gdrive/gdriveSyncService.js`

**Step 1: Implement background worker and queue consumer**
Replace the inline `syncWorker` in `scanNow` with a persistent worker loop that calls `this.db.gdriveSyncQueueGetNext()`. Replace `queue.push()` with `this.db.gdriveSyncQueueAdd()`.

**Step 2: Commit**
```bash
git add electron/lib/gdrive/gdriveSyncService.js
git commit -m "feat(gdrive): switch in-memory sync queue to persistent sqlite queue"
```

### Task 3: Auto-Resume Queue on Startup

**Files:**
- Modify: `electron/lib/gdrive/gdriveSyncService.js`

**Step 1: Start worker on init/connect**
Invoke the worker in the connection handler.

**Step 2: Commit**
```bash
git add electron/lib/gdrive/gdriveSyncService.js
git commit -m "feat(gdrive): auto resume sync queue on startup"
```
