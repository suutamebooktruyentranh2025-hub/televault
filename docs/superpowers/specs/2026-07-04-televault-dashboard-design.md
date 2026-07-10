# TeleVault Desktop — Dashboard Tab Design

**Date:** 2026-07-04  
**Scope:** TeleVault Desktop (Electron + React) only  
**Status:** Draft — pending user review

## Goal

Add a **Dashboard** sidebar tab (pattern inspired by crawler-mobile) showing vault storage analytics: totals, top folders/files, and a daily upload trend chart. Users can click ranked items to jump into My Drive at the right location.

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Platform | Desktop only |
| Upload chart source | File `mtime` in `index.db` (retroactive for all indexed files) |
| Trash | Excluded from all stats |
| Chart metric | Toggle **file count** / **total bytes** per day |
| Chart range | Toggle **7 days** / **30 days** |
| Top list clicks | Navigate to My Drive → open folder or file |

## Approaches Considered

### 1. Pure aggregator in `@televault/core` + single IPC (recommended)

- Add `dashboardAggregator.js` in `packages/televault-core` with pure functions over `VaultEntry[]`.
- Electron `vault:getDashboard` loads `db.getAll()`, runs aggregator, returns JSON.
- React `DashboardScreen` renders KPI cards, SVG line chart, ranked lists.
- **Pros:** Testable, shared logic if Flutter ports later, no schema migration.
- **Cons:** Full scan on each request (acceptable for personal vault sizes).

### 2. SQL aggregates in `indexDb.js`

- Push GROUP BY / SUM into SQLite.
- **Pros:** Faster for huge vaults.
- **Cons:** Duplicates trash-filter rules; harder to unit test; overkill for v1.

### 3. Persistent upload event log table

- New `upload_events` table written on each successful upload.
- **Pros:** Exact event semantics.
- **Cons:** No history for existing files; rejected in favor of `mtime` (user choice A).

**Recommendation:** Approach **1**.

## Architecture

```
index.db (files)
    → vault:getDashboard IPC
        → buildDashboardStats(entries) [@televault/core]
            → DashboardScreen (React)
                → click row → VaultShell: section=vault, goTo(folder) / openFile
```

### Refresh strategy

- Load dashboard on tab select + when `vault:changed` fires (same as vault listing).
- Optional manual refresh button in header (nice-to-have, include in v1 if trivial).

## Data model (aggregator output)

```typescript
type DashboardStats = {
  totalFiles: number;
  totalBytes: number;
  topFolders: Array<{ path: string; name: string; bytes: number; fileCount: number }>; // max 10
  topFiles: Array<{ messageId: number; path: string; name: string; bytes: number; mtime: string }>; // max 10
  uploadsPerDay: Array<{ date: string; fileCount: number; bytes: number }>; // ISO date YYYY-MM-DD, last N days filled with zeros
};
```

### Filtering rules

- Include only entries where `!path.endsWith('/')` (files, not dir markers).
- Exclude `isInTrash(path)`.
- Folder size = sum of all non-trash file bytes whose path starts with `folderPath` (recursive).
- Top-level folder key for ranking = first segment under `/` (e.g. `/docs/a.pdf` → folder `/docs/`).

### Daily upload series

- Bucket each file by `mtime` UTC date (or local — **use local timezone** for display consistency with Drive UI).
- For selected range (7 or 30 days ending today), emit one point per day; missing days = `{ fileCount: 0, bytes: 0 }`.

## UI layout

Sidebar: new nav item **Dashboard** (icon: chart/bar) between **Thẻ** and **Thùng rác**.

Main area (scrollable, Google Drive–like cards):

1. **KPI row** (2 tiles)
   - Tổng dung lượng (formatted B/KB/MB/GB)
   - Tổng số file

2. **Upload trend** (card)
   - Title + toggles: `7 ngày | 30 ngày` and `Số file | Dung lượng`
   - SVG polyline/area chart (no new npm chart library in v1)
   - Empty state when no files in range

3. **Two-column lists** (stack on narrow width)
   - Top 10 folder (name, size, file count) — clickable
   - Top 10 file (name, size, modified) — clickable

Top bar title: `Dashboard` (no search bar on this section).

## Navigation on click

| Item | Action |
|------|--------|
| Top folder row | `setSection('vault')`, `vault.goTo(folderPath)`, clear selection |
| Top file row | `setSection('vault')`, `vault.goTo(parentFolder)`, then `openFile(entry)` or select+scroll (open file handler existing in VaultShell) |

Pass callbacks from `VaultShell` into `DashboardScreen`: `onOpenFolder(path)`, `onOpenFile(file)`.

## Components (new / modified)

| File | Change |
|------|--------|
| `packages/televault-core/src/dashboardAggregator.js` | New — pure stats |
| `packages/televault-core/__tests__/dashboardAggregator.test.js` | New |
| `electron/lib/ipc/vaultHandlers.js` | `vault:getDashboard` handler |
| `electron/preload.js` | expose `getDashboard` |
| `src/screens/DashboardScreen.jsx` | New |
| `src/components/DashboardUploadChart.jsx` | New — SVG chart |
| `src/components/DashboardRankList.jsx` | New — reusable ranked table |
| `src/components/VaultShell.jsx` | section `dashboard`, wire navigation |
| `src/components/DriveSidebar.jsx` | nav item + hide "New" menu actions when on dashboard (optional: disable upload from sidebar on dashboard — uploads still OK from vault tab) |
| `src/i18n/locales.js` | dashboard strings |
| `src/index.css` | dashboard card/chart styles |

## Error handling

- Vault not ready (`phase !== 'ready'`): show empty/loading state ("Đang tải kho…" / sync prompt).
- IPC failure: inline error + retry button.
- Zero files: friendly empty state, hide chart or show flat zero line.

## Testing

- Unit tests for `buildDashboardStats`: totals, trash exclusion, folder aggregation, top-10 ordering, daily buckets, zero-fill for range.
- Manual: upload files across days (or tweak mtime in test DB), verify chart toggle and navigation.

## Out of scope (v1)

- Flutter / mobile dashboard
- Download stats, transfer queue analytics
- Tag breakdown donut chart
- 90-day / all-time range
- Persistent upload event log
- Including trash in stats

## Success criteria

- User opens Dashboard tab and sees correct totals vs My Drive file count.
- Top 10 lists match expected largest folders/files (excluding trash).
- Chart toggles 7/30 days and count/bytes without reload bug.
- Clicking a top folder/file lands in My Drive at the correct target.
