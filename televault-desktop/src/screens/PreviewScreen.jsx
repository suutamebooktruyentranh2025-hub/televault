import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const TEXT_EXT = new Set(['txt', 'md', 'json', 'xml', 'csv', 'log', 'js', 'ts', 'jsx', 'tsx', 'html', 'css']);

export function PreviewScreen({ file, onClose }) {
  const { t } = useI18n();
  const [localPath, setLocalPath] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await window.televault?.vault?.getLocalPath(file.messageId);
        if (cancelled) return;
        if (!result?.ok) {
          setError(result?.error || t('errorGeneric'));
          return;
        }
        setLocalPath(result.localPath);
        if (TEXT_EXT.has(ext || '')) {
          const textResult = await window.televault?.vault?.readFileText(file.messageId);
          if (textResult?.ok) setText(textResult.text);
        }
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.messageId, ext, t]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      <div className="mx-auto mt-8 flex max-h-[90vh] w-[min(960px,95vw)] flex-col rounded-2xl bg-[var(--gd-surface)] shadow-xl">
      <div className="flex items-center justify-between border-b border-[var(--gd-border)] px-4 py-3">
          <h2 className="truncate text-sm font-medium text-[var(--gd-text)]">{file.name}</h2>
          <button type="button" className="text-sm text-[var(--gd-primary)] hover:underline" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
        <div className="min-h-[320px] flex-1 overflow-auto p-4">
          {error && <p className="text-sm text-[var(--gd-danger)]">{error}</p>}
          {!error && !localPath && <p className="text-sm text-[var(--gd-text-secondary)]">{t('loading')}</p>}
          {localPath && IMAGE_EXT.has(ext || '') && (
            <img src={`tv-local://${localPath}`} alt={file.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />
          )}
          {localPath && TEXT_EXT.has(ext || '') && (
            <pre className="whitespace-pre-wrap text-sm text-[var(--gd-text)]">{text}</pre>
          )}
          {localPath && !IMAGE_EXT.has(ext || '') && !TEXT_EXT.has(ext || '') && (
            <p className="text-sm text-[var(--gd-text-secondary)]">{file.name}</p>
          )}
        </div>
      </div>
    </div>
  );
}
