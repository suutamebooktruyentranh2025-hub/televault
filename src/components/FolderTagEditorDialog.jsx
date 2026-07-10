import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconLabel } from './DriveIcons';
import { useI18n } from '../context/I18nContext';

function filterSuggestions(knownTags, selectedTags, query) {
  const selected = new Set(selectedTags);
  const q = query.trim().toLowerCase();
  return knownTags.filter((tag) => {
    if (selected.has(tag)) return false;
    if (!q) return true;
    return tag.toLowerCase().includes(q);
  });
}

export function FolderTagEditorDialog({
  folderName,
  initialTags,
  knownTags,
  onCancel,
  onSave,
}) {
  const { t } = useI18n();
  const [tags, setTags] = useState(() => [...initialTags]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const suggestions = useMemo(
    () => filterSuggestions(knownTags, tags, input),
    [knownTags, tags, input],
  );

  function addTag(raw) {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) return;
    setTags((prev) => [...prev, tag]);
    setInput('');
  }

  function removeTag(tag) {
    setTags((prev) => prev.filter((item) => item !== tag));
  }

  function handleInputChange(value) {
    if (value.includes(',')) {
      const parts = value.split(',');
      for (let i = 0; i < parts.length - 1; i += 1) {
        addTag(parts[i]);
      }
      setInput(parts.at(-1) || '');
      return;
    }
    setInput(value);
  }

  async function handleSave() {
    let nextTags = [...tags];
    const pending = input.trim();
    if (pending && !nextTags.includes(pending)) {
      nextTags = [...nextTags, pending];
    }
    setSaving(true);
    try {
      const ok = await onSave(nextTags);
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="gd-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="gd-dialog gd-tag-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('folderTagDialogTitle', { name: folderName })}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="gd-tag-editor-title">{t('folderTagDialogTitle', { name: folderName })}</h2>

        {tags.length > 0 ? (
          <div className="gd-tag-chip-list">
            {tags.map((tag) => (
              <span key={tag} className="gd-tag-chip">
                <IconLabel className="h-4 w-4 shrink-0" />
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  className="gd-tag-chip-remove"
                  aria-label={t('tagRemoveFromFolder', { name: tag })}
                  onClick={() => removeTag(tag)}
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="gd-tag-editor-empty">{t('tagEmptyHint')}</p>
        )}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={t('tagInputHint')}
          className="gd-dialog-input"
        />

        {suggestions.length > 0 && (
          <div className="gd-tag-suggestions">
            <div className="gd-tag-suggestions-label">{t('tagAvailable')}</div>
            <div className="gd-tag-suggestions-list">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="gd-tag-suggestion-row"
                  onClick={() => {
                    addTag(tag);
                    inputRef.current?.focus();
                  }}
                >
                  <IconLabel className="h-4 w-4 shrink-0 text-[var(--gd-text-secondary)]" />
                  <span className="truncate">{tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="gd-dialog-actions">
          <button type="button" className="gd-dialog-btn" onClick={onCancel} disabled={saving}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="gd-dialog-btn gd-dialog-btn--primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
