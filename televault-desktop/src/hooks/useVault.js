import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const vaultApi = window.televault?.vault;

export function useVault({ enabled = true } = {}) {
  const [currentFolder, setCurrentFolder] = useState(() => localStorage.getItem('televault_current_folder') || '/');
  useEffect(() => {
    localStorage.setItem('televault_current_folder', currentFolder);
  }, [currentFolder]);
  const [expandedFolders, setExpandedFolders] = useState(['/']);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [viewMode, setViewMode] = useState('list');
  const [allFolders, setAllFolders] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [treeRows, setTreeRows] = useState([]);
  const [stats, setStats] = useState({ count: 0, trashFolder: '/Rác/' });
  const [loading, setLoading] = useState(true);
  const prevFolderRef = useRef(currentFolder);

  const breadcrumbs = useMemo(() => {
    if (currentFolder === '/') return [{ label: 'My Drive', path: '/' }];
    const parts = currentFolder.split('/').filter(Boolean);
    const crumbs = [{ label: 'My Drive', path: '/' }];
    for (let i = 0; i < parts.length; i += 1) {
      crumbs.push({
        label: parts[i],
        path: `/${parts.slice(0, i + 1).join('/')}/`,
      });
    }
    return crumbs;
  }, [currentFolder]);

  const reload = useCallback(async ({ showLoading = false } = {}) => {
    if (!enabled || !vaultApi) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const foldersPromise = typeof vaultApi.allFolders === 'function'
        ? vaultApi.allFolders().catch(() => ({ ok: false, folders: [] }))
        : Promise.resolve({ ok: false, folders: [] });

      const [listing, tree, stat, folderResult] = await Promise.all([
        vaultApi.getListing(currentFolder, sortField, sortDirection),
        vaultApi.getTree([...expandedFolders]),
        vaultApi.getStats(),
        foldersPromise,
      ]);
      if (listing.ok) {
        setFolders(listing.folders);
        setFiles(listing.files);
      }
      if (tree.ok) setTreeRows(tree.rows);
      if (stat.ok) setStats({ count: stat.count, trashFolder: stat.trashFolder });
      if (folderResult?.ok) setAllFolders(folderResult.folders);
    } finally {
      setLoading(false);
    }
  }, [enabled, currentFolder, sortField, sortDirection, expandedFolders]);

  useEffect(() => {
    const folderChanged = prevFolderRef.current !== currentFolder;
    prevFolderRef.current = currentFolder;
    void reload({ showLoading: folderChanged });
  }, [currentFolder, sortField, sortDirection, expandedFolders, reload]);

  useEffect(() => {
    if (!enabled || !vaultApi?.onChanged) return undefined;
    const unsub = vaultApi.onChanged(() => {
      void reload({ showLoading: false });
    });
    return unsub;
  }, [enabled, reload]);

  const goTo = useCallback((folder) => {
    setCurrentFolder(folder);
  }, []);

  const toggleFolderExpanded = useCallback((folderPath) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return [...next];
    });
  }, []);

  const toggleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === 'list' ? 'grid' : 'list'));
  }, []);

  return {
    currentFolder,
    folders,
    files,
    allFolders,
    treeRows,
    breadcrumbs,
    stats,
    loading,
    sortField,
    sortDirection,
    viewMode,
    expandedFolders,
    goTo,
    toggleFolderExpanded,
    toggleSort,
    toggleViewMode,
    refresh: reload,
  };
}
