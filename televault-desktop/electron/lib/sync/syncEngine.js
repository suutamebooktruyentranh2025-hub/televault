/**
 * Three-way diff between local files, remote (Telegram) files, and the manifest
 * (snapshot of last successful sync).
 *
 * @param {{
 *   localFiles: Array<{ relPath: string, sha256: string, mtime: string }>,
 *   remoteFiles: Array<{ relPath: string, sha256: string, messageId: number }>,
 *   manifest: Array<{ relPath: string, sha256: string, side: string }>,
 *   mode: 'upload-only' | 'two-way',
 * }} input
 * @returns {Array<{ action: string, relPath: string, [key: string]: unknown }>}
 */
function computeSyncActions({ localFiles, remoteFiles, manifest, mode }) {
  const localMap = new Map(localFiles.map(f => [f.relPath, f]));
  const remoteMap = new Map(remoteFiles.map(f => [f.relPath, f]));
  const manifestMap = new Map(manifest.map(f => [f.relPath, f]));
  const isTwoWay = mode === 'two-way';

  const allPaths = new Set([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...manifestMap.keys(),
  ]);

  /** @type {Array<{ action: string, relPath: string, [key: string]: unknown }>} */
  const actions = [];

  for (const relPath of allPaths) {
    const local = localMap.get(relPath);
    const remote = remoteMap.get(relPath);
    const prev = manifestMap.get(relPath);

    // Case 1: New local file (not in manifest, not in remote)
    if (local && !remote && !prev) {
      actions.push({ action: 'upload', relPath, sha256: local.sha256 });
      continue;
    }

    // Case 2: New remote file (not in manifest, not in local)
    if (!local && remote && !prev) {
      if (isTwoWay) {
        actions.push({ action: 'download', relPath, sha256: remote.sha256, messageId: remote.messageId });
      }
      continue;
    }

    // Case 3: File exists in manifest — check for changes
    if (prev) {
      const localChanged = local && local.sha256 !== prev.sha256;
      const remoteChanged = remote && remote.sha256 !== prev.sha256;
      const localDeleted = !local;
      const remoteDeleted = !remote;

      // Both changed → conflict
      if (localChanged && remoteChanged) {
        actions.push({
          action: 'conflict',
          relPath,
          localSha: local.sha256,
          remoteSha: remote.sha256,
          messageId: remote.messageId,
        });
        continue;
      }

      // Local changed, remote unchanged → upload
      if (localChanged && !remoteChanged) {
        actions.push({ action: 'upload', relPath, sha256: local.sha256 });
        continue;
      }

      // Remote changed, local unchanged → download (two-way only)
      if (remoteChanged && !localChanged) {
        if (isTwoWay) {
          actions.push({ action: 'download', relPath, sha256: remote.sha256, messageId: remote.messageId });
        }
        continue;
      }

      // Local deleted, remote still exists → delete remote
      if (localDeleted && remote) {
        actions.push({ action: 'delete-remote', relPath, messageId: remote.messageId });
        continue;
      }

      // Remote deleted, local still exists
      if (remoteDeleted && local) {
        if (isTwoWay) {
          actions.push({ action: 'delete-local', relPath });
        } else {
          // upload-only: re-upload the file
          actions.push({ action: 'upload', relPath, sha256: local.sha256 });
        }
        continue;
      }
    }

    // Case 4: Both exist, no manifest (shouldn't normally happen after initial sync)
    // but handle gracefully — compare SHA
    if (local && remote && !prev) {
      if (local.sha256 !== remote.sha256) {
        if (isTwoWay) {
          actions.push({
            action: 'conflict',
            relPath,
            localSha: local.sha256,
            remoteSha: remote.sha256,
            messageId: remote.messageId,
          });
        } else {
          actions.push({ action: 'upload', relPath, sha256: local.sha256 });
        }
      }
      // Same SHA → already synced, no action
    }
  }

  return actions;
}

module.exports = { computeSyncActions };
