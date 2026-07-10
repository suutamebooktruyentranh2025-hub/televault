export function DriveBreadcrumb({ crumbs, onNavigate }) {
  if (crumbs.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {i > 0 && <span className="text-[var(--gd-text-secondary)]">›</span>}
          <button
            type="button"
            onClick={() => onNavigate(crumb.path)}
            className={`rounded px-2 py-1 hover:bg-[var(--gd-hover)] ${
              i === crumbs.length - 1
                ? 'font-medium text-[var(--gd-text)]'
                : 'text-[var(--gd-text-secondary)]'
            }`}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}
