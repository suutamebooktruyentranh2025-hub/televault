import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconChevronUp } from './DriveIcons';

export function SettingsSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function pick(next) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="gd-settings-select-wrap">
      <button
        type="button"
        className={`gd-settings-select-trigger${open ? ' gd-settings-select-trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="gd-settings-select-trigger-label">{selected?.label}</span>
        {open ? (
          <IconChevronUp className="gd-settings-select-chevron" />
        ) : (
          <IconChevronDown className="gd-settings-select-chevron" />
        )}
      </button>
      {open && (
        <div className="gd-settings-select-menu" role="listbox">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`gd-settings-select-option${isSelected ? ' gd-settings-select-option--selected' : ''}`}
                onClick={() => pick(opt.value)}
              >
                <span className="gd-settings-select-check-slot">
                  {isSelected ? <IconCheck className="gd-settings-select-check" /> : null}
                </span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
