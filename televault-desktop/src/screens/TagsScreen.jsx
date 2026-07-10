import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconFolder, IconRename, IconTrash } from '../components/DriveIcons';
import { useDialog } from '../context/DialogContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';

const api = window.televault?.vault;

function folderNameFromPath(path) {
  if (!path || path === '/') return path;
  return path.split('/').filter(Boolean).at(-1) || path;
}

function SortHeader({ active, direction, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--gd-text)]">
      {children}
      {active ? <span className="text-[var(--gd-primary)]">{direction === 'asc' ? '↑' : '↓'}</span> : null}
    </button>
  );
}

/**
 * @param {{ onOpenFolder?: (folderPath: string) => void }} props
 */
export function TagsScreen({ onOpenFolder }) {
  const { t } = useI18n();
  const { prompt, confirm } = useDialog();
  const { showToast } = useToast();
  const [tagNames, setTagNames] = useState([]);
  /** @type {Record<string, string[]>} */
  const [foldersByTag, setFoldersByTag] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  const sortedTagNames = useMemo(() => {
    const list = [...tagNames];
    const dir = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === 'count') {
        const diff = (foldersByTag[a]?.length || 0) - (foldersByTag[b]?.length || 0);
        if (diff !== 0) return diff * dir;
      }
      return a.localeCompare(b, undefined, { sensitivity: 'base' }) * dir;
    });
    return list;
  }, [tagNames, foldersByTag, sortField, sortDirection]);

  function toggleSort(field) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection(field === 'name' ? 'asc' : 'desc');
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api?.allTags();
      if (result?.ok) {
        const folders = result.foldersByTag || {};
        const counts = result.tags || {};
        const names = [
          ...new Set([...(result.names || []), ...Object.keys(folders), ...Object.keys(counts)]),
        ];
        setTagNames(names);
        setFoldersByTag(folders);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return api?.onChanged?.(() => {
      void refresh();
    });
  }, [refresh]);

  function toggleExpanded(tag) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function handleRename(tag) {
    const name = await prompt(t('newName'), tag);
    if (!name?.trim() || name.trim() === tag) return;
    const result = await api?.renameTag(tag, name.trim());
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    setExpanded((prev) => {
      if (!prev.has(tag)) return prev;
      const next = new Set(prev);
      next.delete(tag);
      next.add(name.trim());
      return next;
    });
    await refresh();
  }

  async function handleDelete(tag) {
    if (!(await confirm(t('tagDeleteConfirm', { name: tag })))) return;
    const result = await api?.deleteTag(tag);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    setExpanded((prev) => {
      if (!prev.has(tag)) return prev;
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
    await refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      {loading ? (
        <p className="text-sm text-[var(--gd-text-secondary)]">{t('loading')}</p>
      ) : tagNames.length === 0 ? (
        <p className="text-sm text-[var(--gd-text-secondary)]">{t('tagsEmpty')}</p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-6 border-b border-[var(--gd-border)] px-1 pb-2 text-xs font-medium text-[var(--gd-text-secondary)]">
            <SortHeader active={sortField === 'name'} direction={sortDirection} onClick={() => toggleSort('name')}>
              {t('tagsSortName')}
            </SortHeader>
            <SortHeader active={sortField === 'count'} direction={sortDirection} onClick={() => toggleSort('count')}>
              {t('tagsSortCount')}
            </SortHeader>
          </div>
          <div className="space-y-2">
          {sortedTagNames.map((tag) => {
            const folders = foldersByTag[tag] || [];
            const isOpen = expanded.has(tag);
            return (
              <div
                key={tag}
                className="overflow-hidden rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)]"
              >
                <div className="flex items-center gap-1 px-2 py-2 hover:bg-[var(--gd-hover)]">
                  <button
                    type="button"
                    className="gd-tag-expand"
                    aria-expanded={isOpen}
                    aria-label={tag}
                    onClick={() => toggleExpanded(tag)}
                  >
                    {isOpen ? (
                      <IconChevronDown className="h-5 w-5 text-[var(--gd-text-secondary)]" />
                    ) : (
                      <IconChevronRight className="h-5 w-5 text-[var(--gd-text-secondary)]" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="gd-tag-row-main min-w-0 flex-1 text-left"
                    onClick={() => toggleExpanded(tag)}
                  >
                    <div className="truncate font-medium text-[var(--gd-text)]">{tag}</div>
                    <div className="text-xs text-[var(--gd-text-secondary)]">
                      {folders.length > 0
                        ? t('tagFolderCount', { n: String(folders.length) })
                        : t('tagFoldersEmpty')}
                    </div>
                  </button>
                  <div className="gd-tag-actions">
                    <button
                      type="button"
                      className="gd-row-action"
                      title={t('tagRename')}
                      aria-label={t('tagRename')}
                      onClick={() => void handleRename(tag)}
                    >
                      <IconRename className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="gd-row-action"
                      title={t('tagDelete')}
                      aria-label={t('tagDelete')}
                      onClick={() => void handleDelete(tag)}
                    >
                      <IconTrash className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="border-t border-[var(--gd-border)] bg-[var(--gd-bg)] px-3 py-2">
                    {folders.length === 0 ? (
                      <p className="px-1 py-2 text-sm text-[var(--gd-text-secondary)]">{t('tagFoldersEmpty')}</p>
                    ) : (
                      <ul className="gd-tag-folder-list">
                        {folders.map((folderPath) => {
                          const name = folderNameFromPath(folderPath);
                          return (
                            <li key={folderPath}>
                              <button
                                type="button"
                                className="gd-tag-folder-row"
                                title={folderPath}
                                aria-label={t('tagOpenFolder', { name })}
                                onClick={() => onOpenFolder?.(folderPath)}
                              >
                                <IconFolder className="h-5 w-5 shrink-0 text-[var(--gd-text-secondary)]" />
                                <span className="min-w-0 flex-1 text-left">
                                  <span className="block truncate text-sm text-[var(--gd-text)]">{name}</span>
                                  <span className="block truncate text-xs text-[var(--gd-text-secondary)]">
                                    {folderPath}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}
