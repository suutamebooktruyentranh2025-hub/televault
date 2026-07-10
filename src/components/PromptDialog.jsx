import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext';

export function PromptDialog({ message, defaultValue = '', onSubmit, onCancel }) {
  const { t } = useI18n();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return createPortal(
    <div className="gd-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="gd-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="gd-dialog-message">{message}</p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="gd-dialog-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(value.trim());
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="gd-dialog-actions">
          <button type="button" className="gd-dialog-btn" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button type="button" className="gd-dialog-btn gd-dialog-btn--primary" onClick={() => onSubmit(value.trim())}>
            {t('ok')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
