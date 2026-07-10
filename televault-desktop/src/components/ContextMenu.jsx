import { createPortal } from 'react-dom';
import { getMenuPosition } from '../utils/menuPosition';

export function ContextMenu({ x, y, anchor, items, onClose }) {
  const { x: left, y: top } = getMenuPosition({ items, anchor, x, y });

  return createPortal(
    <>
      <button
        type="button"
        className="gd-context-backdrop fixed inset-0 cursor-default"
        onClick={onClose}
        aria-label="close menu"
      />
      <div className="gd-menu gd-context-menu fixed min-w-[220px] py-1" style={{ left, top }}>
        {items.map((item, index) => {
          if (item.separator) {
            return <div key={`sep-${index}`} className="my-1 border-t border-[var(--gd-border)]" role="separator" />;
          }

          return (
            <button
              key={item.label}
              type="button"
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--gd-hover)] ${
                item.danger ? 'text-[var(--gd-danger)]' : 'text-[var(--gd-text)]'
              }`}
              onClick={() => {
                onClose();
                item.action();
              }}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                  item.danger ? '' : 'text-[var(--gd-text-secondary)]'
                }`}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
