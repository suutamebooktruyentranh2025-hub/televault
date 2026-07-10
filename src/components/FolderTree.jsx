import { useI18n } from '../context/I18nContext';

export function FolderTree({ rows, currentFolder, onNavigate, onToggleExpanded }) {
  const { t } = useI18n();

  return (
    <aside className="hidden w-52 shrink-0 overflow-auto border-r border-[#e8deff] bg-[#f8f7fc] lg:block">
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#4a4458]">
        {t('folderTree')}
      </p>
      <div className="pb-4">
        {rows.map((row) => {
          if (row.kind === 'folder') {
            const selected = currentFolder === row.path;
            return (
              <div
                key={row.path}
                className="flex items-center"
                style={{ paddingLeft: `${8 + row.depth * 12}px` }}
              >
                {row.hasChildren ? (
                  <button
                    type="button"
                    className="mr-1 text-xs text-[#5a3799]"
                    onClick={() => onToggleExpanded(row.path)}
                  >
                    {row.expanded ? '▾' : '▸'}
                  </button>
                ) : (
                  <span className="mr-1 w-3" />
                )}
                <button
                  type="button"
                  onClick={() => onNavigate(row.path)}
                  className={`flex-1 truncate rounded px-1 py-1 text-left text-sm ${
                    selected ? 'bg-[#e8deff] font-medium text-[#21005d]' : 'hover:bg-white'
                  }`}
                >
                  📁 {row.name}
                </button>
              </div>
            );
          }
          return (
            <div
              key={row.entry.messageId}
              className="truncate px-3 py-1 text-sm text-[#4a4458]"
              style={{ paddingLeft: `${20 + row.depth * 12}px` }}
            >
              📄 {row.entry.name}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
