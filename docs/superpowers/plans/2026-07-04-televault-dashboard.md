# TeleVault Dashboard Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dashboard sidebar tab to TeleVault Desktop showing vault totals, top-10 folders/files, and a daily upload chart (mtime-based), with navigation into My Drive on row click.

**Architecture:** Pure `buildDashboardStats(entries, options)` in `@televault/core` filters non-trash files and aggregates sizes, rankings, and daily buckets. Electron exposes `vault:getDashboard` IPC. React `DashboardScreen` renders KPI tiles, SVG chart, and ranked lists; `VaultShell` wires section routing and open-folder/file callbacks.

**Tech Stack:** Node test runner, `@televault/core`, better-sqlite3 (existing), React 19, Tailwind/CSS vars (`gd-*`), no new chart npm packages.

**Spec:** `docs/superpowers/specs/2026-07-04-televault-dashboard-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/televault-core/src/dashboardAggregator.js` | Pure stats from `VaultEntry[]` |
| `packages/televault-core/__tests__/dashboardAggregator.test.js` | Unit tests |
| `packages/televault-core/src/index.js` | Re-export aggregator |
| `electron/lib/ipc/vaultHandlers.js` | `vault:getDashboard` handler |
| `electron/preload.js` | `getDashboard()` bridge |
| `src/hooks/useDashboard.js` | Fetch + refresh on `vault:changed` |
| `src/components/DashboardUploadChart.jsx` | SVG line chart |
| `src/components/DashboardRankList.jsx` | Top-N clickable table |
| `src/screens/DashboardScreen.jsx` | Page layout + toggles |
| `src/components/VaultShell.jsx` | `section === 'dashboard'`, navigation callbacks |
| `src/components/DriveSidebar.jsx` | Nav item + chart icon |
| `src/components/DriveIcons.jsx` | `IconDashboard` |
| `src/i18n/locales.js` | vi/en strings |
| `src/index.css` | Dashboard card/chart styles |

---

### Task 1: Dashboard aggregator (core + tests)

**Files:**
- Create: `televault-desktop/packages/televault-core/src/dashboardAggregator.js`
- Create: `televault-desktop/packages/televault-core/__tests__/dashboardAggregator.test.js`
- Modify: `televault-desktop/packages/televault-core/src/index.js`

- [ ] **Step 1: Write failing tests**

```javascript
// packages/televault-core/__tests__/dashboardAggregator.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry, dirMarker, buildDashboardStats } = require('../src');

function f(id, path, size, mtime) {
  return createVaultEntry({
    messageId: id,
    path,
    size,
    sha256: 'h',
    mtime: new Date(mtime),
  });
}

describe('buildDashboardStats', () => {
  it('totals exclude trash and dir markers', () => {
    const entries = [
      f(1, '/a.txt', 100, '2026-07-01T10:00:00Z'),
      f(2, '/docs/b.pdf', 900, '2026-07-02T10:00:00Z'),
      f(3, '/Rác/deleted.txt', 5000, '2026-07-03T10:00:00Z'),
      dirMarker({ messageId: 4, path: '/docs/' }),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 30, today: new Date('2026-07-04T12:00:00Z') });
    assert.equal(stats.totalFiles, 2);
    assert.equal(stats.totalBytes, 1000);
  });

  it('top folders aggregate nested bytes', () => {
    const entries = [
      f(1, '/big/x.txt', 100, '2026-07-01T10:00:00Z'),
      f(2, '/big/sub/y.txt', 400, '2026-07-01T11:00:00Z'),
      f(3, '/small.txt', 50, '2026-07-01T12:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    assert.equal(stats.topFolders[0].path, '/big/');
    assert.equal(stats.topFolders[0].bytes, 500);
    assert.equal(stats.topFolders[0].fileCount, 2);
  });

  it('top files sorted by size desc', () => {
    const entries = [
      f(1, '/a.txt', 10, '2026-07-01T10:00:00Z'),
      f(2, '/b.txt', 100, '2026-07-01T10:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    assert.deepEqual(stats.topFiles.map((x) => x.messageId), [2, 1]);
  });

  it('uploadsPerDay buckets by local date and zero-fills range', () => {
    const entries = [
      f(1, '/a.txt', 100, '2026-07-03T23:00:00Z'),
      f(2, '/b.txt', 200, '2026-07-04T01:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, {
      rangeDays: 3,
      today: new Date('2026-07-04T12:00:00Z'),
      timeZone: 'UTC',
    });
    assert.equal(stats.uploadsPerDay.length, 3);
    const last = stats.uploadsPerDay.at(-1);
    assert.equal(last.date, '2026-07-04');
    assert.equal(last.fileCount, 1);
    assert.equal(last.bytes, 200);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd televault-desktop/packages/televault-core && npm test`
Expected: FAIL — `buildDashboardStats is not a function`

- [ ] **Step 3: Implement aggregator**

```javascript
// packages/televault-core/src/dashboardAggregator.js
const { isDir, entryName } = require('./vaultEntry');
const { isInTrash } = require('./trash');

function visibleFiles(all) {
  return all.filter((e) => !isDir(e) && !isInTrash(e.path));
}

function topLevelFolderPath(filePath) {
  const rest = filePath.slice(1);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  return `/${rest.slice(0, slash + 1)}`;
}

function formatLocalDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildDateRange(endDate, days, timeZone) {
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    keys.push(formatLocalDate(d, timeZone));
  }
  return keys;
}

/**
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {{ rangeDays?: number, today?: Date, timeZone?: string, topN?: number }} [options]
 */
function buildDashboardStats(all, options = {}) {
  const rangeDays = options.rangeDays ?? 30;
  const today = options.today ?? new Date();
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const topN = options.topN ?? 10;

  const files = visibleFiles(all);
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, e) => sum + e.size, 0);

  /** @type {Map<string, { path: string, name: string, bytes: number, fileCount: number }>} */
  const folderMap = new Map();
  for (const file of files) {
    const folderPath = topLevelFolderPath(file.path);
    if (!folderPath) continue;
    const row = folderMap.get(folderPath) || {
      path: folderPath,
      name: entryName({ path: folderPath.slice(0, -1) + '/x' }),
      bytes: 0,
      fileCount: 0,
    };
    row.name = folderPath.slice(1, -1).split('/').pop();
    row.bytes += file.size;
    row.fileCount += 1;
    folderMap.set(folderPath, row);
  }
  const topFolders = [...folderMap.values()]
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, topN);

  const topFiles = [...files]
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, topN)
    .map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      bytes: e.size,
      mtime: e.mtime.toISOString(),
    }));

  const dateKeys = buildDateRange(today, rangeDays, timeZone);
  /** @type {Map<string, { date: string, fileCount: number, bytes: number }>} */
  const byDay = new Map(dateKeys.map((date) => [date, { date, fileCount: 0, bytes: 0 }]));
  for (const file of files) {
    const key = formatLocalDate(file.mtime, timeZone);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.fileCount += 1;
    bucket.bytes += file.size;
  }
  const uploadsPerDay = dateKeys.map((date) => byDay.get(date));

  return { totalFiles, totalBytes, topFolders, topFiles, uploadsPerDay };
}

module.exports = { buildDashboardStats, visibleFiles };
```

Add to `packages/televault-core/src/index.js`:

```javascript
  ...require('./dashboardAggregator'),
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd televault-desktop/packages/televault-core && npm test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add televault-desktop/packages/televault-core/src/dashboardAggregator.js \
  televault-desktop/packages/televault-core/__tests__/dashboardAggregator.test.js \
  televault-desktop/packages/televault-core/src/index.js
git commit -m "feat(core): add dashboard stats aggregator for vault analytics"
```

---

### Task 2: IPC `vault:getDashboard`

**Files:**
- Modify: `televault-desktop/electron/lib/ipc/vaultHandlers.js`
- Modify: `televault-desktop/electron/preload.js`

- [ ] **Step 1: Add handler** (after `vault:getStats`)

```javascript
  ipcMain.handle('vault:getDashboard', (_evt, { rangeDays = 30 } = {}) => {
    if (!ctx.isReady()) {
      return { ok: false, error: 'not_ready' };
    }
    const { buildDashboardStats } = require('@televault/core');
    const all = ctx.getDb().getAll();
    const stats = buildDashboardStats(all, { rangeDays: Number(rangeDays) || 30 });
    return { ok: true, stats };
  });
```

- [ ] **Step 2: Expose in preload**

```javascript
    getDashboard: (rangeDays) => ipcRenderer.invoke('vault:getDashboard', { rangeDays }),
```

- [ ] **Step 3: Smoke test manually**

Run app, in DevTools: `await window.televault.vault.getDashboard(7)` → `{ ok: true, stats: { totalFiles, ... } }`

- [ ] **Step 4: Commit**

```bash
git add televault-desktop/electron/lib/ipc/vaultHandlers.js televault-desktop/electron/preload.js
git commit -m "feat(desktop): expose vault dashboard stats via IPC"
```

---

### Task 3: `useDashboard` hook

**Files:**
- Create: `televault-desktop/src/hooks/useDashboard.js`

- [ ] **Step 1: Implement hook**

```javascript
import { useCallback, useEffect, useState } from 'react';

const vaultApi = window.televault?.vault;

export function useDashboard({ enabled = true, rangeDays = 30 } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled || !vaultApi?.getDashboard) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await vaultApi.getDashboard(rangeDays);
      if (!result?.ok) {
        setError(result?.error || 'failed');
        setStats(null);
      } else {
        setStats(result.stats);
      }
    } catch (e) {
      setError(String(e.message || e));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, rangeDays]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !vaultApi?.onChanged) return undefined;
    const unsub = vaultApi.onChanged(() => void reload());
    return unsub;
  }, [enabled, reload]);

  return { stats, loading, error, reload };
}
```

- [ ] **Step 2: Commit**

```bash
git add televault-desktop/src/hooks/useDashboard.js
git commit -m "feat(desktop): add useDashboard hook with vault change refresh"
```

---

### Task 4: Chart + rank list components

**Files:**
- Create: `televault-desktop/src/components/DashboardUploadChart.jsx`
- Create: `televault-desktop/src/components/DashboardRankList.jsx`
- Modify: `televault-desktop/src/index.css`

- [ ] **Step 1: DashboardUploadChart** — props: `data`, `mode: 'count'|'bytes'`, `emptyLabel`, `countLabel`, `bytesLabel`. SVG polyline with 7–30 points, Y-axis max from data, X labels first/last date.

- [ ] **Step 2: DashboardRankList** — props: `title`, `columns`, `rows: [{ key, cells, onClick }]`, `emptyLabel`.

- [ ] **Step 3: CSS** — `.gd-dashboard`, `.gd-dashboard-kpi`, `.gd-dashboard-card`, `.gd-dashboard-chart`, `.gd-dashboard-toggle` matching existing `gd-settings-card` spacing.

- [ ] **Step 4: Commit**

```bash
git add televault-desktop/src/components/DashboardUploadChart.jsx \
  televault-desktop/src/components/DashboardRankList.jsx \
  televault-desktop/src/index.css
git commit -m "feat(desktop): add dashboard chart and rank list components"
```

---

### Task 5: DashboardScreen

**Files:**
- Create: `televault-desktop/src/screens/DashboardScreen.jsx`
- Modify: `televault-desktop/src/i18n/locales.js`

- [ ] **Step 1: Add i18n keys** (vi + en):

```
navDashboard, dashboardTitle, dashboardTotalSize, dashboardTotalFiles,
dashboardUploadTrend, dashboardModeCount, dashboardModeBytes,
dashboardRange7, dashboardRange30, dashboardTopFolders, dashboardTopFiles,
dashboardColName, dashboardColSize, dashboardColFiles, dashboardColModified,
dashboardEmpty, dashboardLoadError, dashboardRetry
```

- [ ] **Step 2: DashboardScreen** — use `useDashboard({ rangeDays })`, local state for `rangeDays` (7|30) and `chartMode` ('count'|'bytes'). KPI row, chart card with toggles, two rank lists. Props: `onOpenFolder(path)`, `onOpenFile({ messageId, path, name, bytes, mtime })`.

Folder click: `onOpenFolder(row.path)`
File click: `onOpenFile(row)` — parent path via `path.slice(0, path.lastIndexOf('/') + 1)`

- [ ] **Step 3: Commit**

```bash
git add televault-desktop/src/screens/DashboardScreen.jsx televault-desktop/src/i18n/locales.js
git commit -m "feat(desktop): add DashboardScreen with KPIs, chart, and top lists"
```

---

### Task 6: Shell integration

**Files:**
- Modify: `televault-desktop/src/components/DriveIcons.jsx` — `IconDashboard` (bar chart SVG)
- Modify: `televault-desktop/src/components/DriveSidebar.jsx` — nav between Tags and Trash
- Modify: `televault-desktop/src/components/VaultShell.jsx`

- [ ] **Step 1: DriveSidebar** — new `NavItem` with `onSectionChange('dashboard')`, `active={section === 'dashboard'}`

- [ ] **Step 2: VaultShell**
  - `sectionTitle`: `dashboard` → `t('dashboardTitle')`
  - `showSearch`: false when `section === 'dashboard'`
  - `mainContent`: render `DashboardScreen` when `section === 'dashboard'`
  - Handlers:

```javascript
function handleDashboardOpenFolder(folderPath) {
  clearSelection();
  setSection('vault');
  vault.goTo(folderPath);
}

function handleDashboardOpenFile(file) {
  clearSelection();
  setSection('vault');
  const parent = file.path.slice(0, file.path.lastIndexOf('/') + 1) || '/';
  vault.goTo(parent);
  void handleOpenFile(file);
}
```

  - Hide "New" upload menu relevance: no change needed (sidebar New still works globally)

- [ ] **Step 3: DriveTopBar** — already uses `pageTitle`; ensure dashboard title shows

- [ ] **Step 4: Manual test checklist**
  - Open Dashboard tab → KPIs match file count in My Drive (exclude trash)
  - Toggle 7/30 and count/bytes on chart
  - Click top folder → lands in folder
  - Click top file → opens file in parent folder
  - Upload file → dashboard refreshes counts

- [ ] **Step 5: Commit**

```bash
git add televault-desktop/src/components/DriveIcons.jsx \
  televault-desktop/src/components/DriveSidebar.jsx \
  televault-desktop/src/components/VaultShell.jsx
git commit -m "feat(desktop): wire Dashboard tab into vault shell and sidebar"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Desktop only | All tasks scoped to televault-desktop |
| mtime daily chart | Task 1 `uploadsPerDay` |
| Exclude trash | Task 1 `visibleFiles` |
| Count/bytes toggle | Task 5 |
| 7/30 day toggle | Task 2 IPC param + Task 5 state |
| Top 10 folders/files | Task 1 + Task 5 |
| Navigate on click | Task 6 |
| No new chart npm | Task 4 SVG |
| Refresh on vault change | Task 3 |

## Out of scope (confirmed)

Flutter, upload event log, trash stats, 90-day range, tag donut — not in any task.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-televault-dashboard.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement all tasks in this session with checkpoints

Which approach do you want?
