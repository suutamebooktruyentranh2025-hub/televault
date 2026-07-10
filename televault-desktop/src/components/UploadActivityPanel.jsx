import { useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { IconChevronDown, IconChevronUp } from './DriveIcons';
import { TransferProgressRing } from './TransferProgressRing';

const STATUS_ORDER = { running: 0, queued: 1, paused: 2, failed: 3, done: 4 };

function sortTasks(tasks) {
  return [...tasks]
    .filter((task) => task.status !== 'cancelled')
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
}

function statusLabel(task, t) {
  if (task.status === 'done') return t('transferStatusDone');
  if (task.status === 'queued') return t('transferStatusQueued');
  if (task.status === 'paused') return t('transferStatusPaused');
  if (task.status === 'failed') return t('transferStatusFailed');
  return null;
}

export function UploadActivityPanel({ tasks, onClearFinished, onCancel }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const displayed = useMemo(() => sortTasks(tasks), [tasks]);
  const active = displayed.filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'paused');
  const finished = displayed.filter((task) => task.status === 'done' || task.status === 'failed');
  const activeProgress = useMemo(() => {
    const running = displayed.filter((task) => task.status === 'running');
    if (running.length === 0) return 0;
    const total = running.reduce((sum, task) => sum + (task.progress || 0), 0);
    return total / running.length;
  }, [displayed]);

  if (displayed.length === 0) return null;

  const uploads = active.filter(t => t.kind === 'upload').length;
  const downloads = active.filter(t => t.kind === 'download').length;
  const numDone = finished.filter(x => x.status === 'done').length;

  let summaryText = '';
  if (uploads > 0 && downloads > 0) {
    summaryText = `Đang tải lên ${uploads}, tải xuống ${downloads}`;
  } else if (uploads > 0) {
    summaryText = `Đang tải lên ${uploads} mục...`;
  } else if (downloads > 0) {
    summaryText = `Đang tải xuống ${downloads} mục...`;
  } else if (numDone > 0) {
    summaryText = `Đã hoàn tất ${numDone} mục`;
  } else {
    summaryText = 'Tiến trình đồng bộ';
  }

  if (collapsed) {
    return (
      <div className="fixed bottom-6 right-6 md:right-8 z-40 w-[300px] md:w-[360px] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl overflow-hidden transition-transform duration-300">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          onClick={() => setCollapsed(false)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-medium truncate tracking-wide">{summaryText}</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <TransferProgressRing
              progress={activeProgress}
              status={active.some((t) => t.status === 'running') ? 'running' : active.length > 0 ? 'queued' : 'done'}
              size={20}
            />
            <IconChevronUp className="h-5 w-5 opacity-60" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 md:right-8 z-40 w-[320px] md:w-[380px] bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[60vh] transition-transform duration-300">
      {/* Header - Unified Card Theme */}
      <div 
        className="flex items-center justify-between px-5 py-3.5 bg-gray-50/80 dark:bg-zinc-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-gray-100 shrink-0 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        onClick={() => setCollapsed(true)}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium tracking-wide">{summaryText}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {finished.length > 0 && (
            <button
              type="button"
              className="text-xs px-2.5 py-1 text-[var(--gd-primary)] hover:bg-black/5 dark:hover:bg-white/10 rounded-md font-medium transition-colors"
              onClick={(e) => { e.stopPropagation(); onClearFinished(); }}
            >
              {t('transfersClear')}
            </button>
          )}
          <button
            type="button"
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors opacity-70 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
            aria-label={t('transfersMinimize')}
          >
            <IconChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body List */}
      <div className="flex-1 overflow-y-auto py-1">
        {displayed.map((task) => {
          const isDone = task.status === 'done';
          return (
            <div key={task.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors group border-b border-gray-100 dark:border-zinc-800/50 last:border-0">
              
              {/* File Icon on the Left */}
              <div className="shrink-0 flex items-center justify-center text-gray-400 dark:text-zinc-500">
                {task.kind === 'download' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
              </div>
              
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <span className="truncate text-[13px] font-medium text-gray-800 dark:text-gray-200" title={task.label}>
                  {task.label}
                </span>
                {task.error && (
                  <span className="truncate text-[11px] text-red-500 mt-0.5" title={task.error}>{task.error}</span>
                )}
              </div>
              
              {/* Progress/Done on the Right */}
              <div className="shrink-0 flex items-center justify-end w-8">
                {isDone ? (
                   <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                     <span className="text-white text-[10px] font-bold leading-none">✓</span>
                   </div>
                ) : task.error ? (
                   <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm" title={task.error}>
                     <span className="text-white text-[10px] font-bold leading-none">!</span>
                   </div>
                ) : (
                  <div className="relative flex items-center justify-center">
                    <div className="group-hover:opacity-0 transition-opacity">
                      <TransferProgressRing progress={task.progress} status={task.status} size={22} />
                    </div>
                    {/* Hover Cancel Button */}
                    <button
                      type="button"
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors"
                      onClick={() => onCancel(task.id)}
                      title={t('cancel')}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
