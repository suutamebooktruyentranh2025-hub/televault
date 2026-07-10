import React, { useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useTransfers } from '../hooks/useTransfers';
import { TransferProgressRing } from '../components/TransferProgressRing';
import { IconClose, IconFolder } from '../components/DriveIcons';

const STATUS_ORDER = { running: 0, queued: 1, paused: 2, failed: 3, done: 4 };

function sortTasks(tasks) {
  return [...tasks]
    .filter((task) => task.status !== 'cancelled')
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
}

function statusBadge(status) {
  switch (status) {
    case 'running':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--gd-primary)]">⟳ Đang tải</span>;
    case 'queued':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--gd-text-secondary)]">⏳ Đang chờ</span>;
    case 'paused':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500">⏸ Tạm dừng</span>;
    case 'done':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-500">✓ Hoàn tất</span>;
    case 'failed':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">✕ Lỗi</span>;
    default:
      return null;
  }
}

export function TransferScreen() {
  const { t } = useI18n();
  const transfers = useTransfers({ enabled: true });
  const displayed = useMemo(() => sortTasks(transfers.tasks), [transfers.tasks]);

  const [activeTab, setActiveTab] = useState('active');

  const active = displayed.filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'paused');
  const finished = displayed.filter((task) => task.status === 'done' || task.status === 'failed');

  const activeProgress = useMemo(() => {
    const running = displayed.filter((task) => task.status === 'running');
    if (running.length === 0) return 0;
    const total = running.reduce((sum, task) => sum + (task.progress || 0), 0);
    return total / running.length;
  }, [displayed]);

  const currentList = activeTab === 'active' ? active : finished;

  return (
    <div className="gd-settings flex min-h-0 flex-1 flex-col overflow-auto p-4">
      {/* Summary card */}
      <section className="gd-settings-group">
        <div className="gd-settings-card">
          <div className="flex items-center gap-4 p-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--gd-primary)]/10">
              <TransferProgressRing
                progress={activeProgress}
                status={active.some((t) => t.status === 'running') ? 'running' : active.length > 0 ? 'queued' : 'done'}
                size={32}
              />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[var(--gd-text)]">Quản lý truyền tải</h2>
              <p className="text-xs text-[var(--gd-text-secondary)] mt-0.5">
                {active.length > 0
                  ? `${active.length} tệp đang tải` + (finished.filter(x => x.status === 'done').length > 0 ? ` · ${finished.filter(x => x.status === 'done').length} đã hoàn tất` : '')
                  : finished.length > 0
                    ? `${finished.filter(x => x.status === 'done').length} đã hoàn tất` + (finished.filter(x => x.status === 'failed').length > 0 ? ` · ${finished.filter(x => x.status === 'failed').length} lỗi` : '')
                    : 'Không có tệp nào đang truyền tải'
                }
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tab bar + table */}
      <section className="gd-settings-group mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-6 items-center">
            <button
              type="button"
              className={`pb-2 text-sm font-semibold cursor-pointer border-b-2 transition-all ${
                activeTab === 'active'
                  ? 'border-[var(--gd-primary)] text-[var(--gd-primary)]'
                  : 'border-transparent opacity-60 hover:opacity-100 text-[var(--gd-text)]'
              }`}
              onClick={() => setActiveTab('active')}
            >
              Đang tải ({active.length})
            </button>
            <button
              type="button"
              className={`pb-2 text-sm font-semibold cursor-pointer border-b-2 transition-all ${
                activeTab === 'finished'
                  ? 'border-[var(--gd-primary)] text-[var(--gd-primary)]'
                  : 'border-transparent opacity-60 hover:opacity-100 text-[var(--gd-text)]'
              }`}
              onClick={() => setActiveTab('finished')}
            >
              Đã hoàn tất ({finished.length})
            </button>
          </div>
          {activeTab === 'finished' && finished.length > 0 && (
            <button
              type="button"
              className="text-xs text-red-500 hover:underline font-semibold cursor-pointer pb-2"
              onClick={() => transfers.clearFinished()}
            >
              Xóa tất cả
            </button>
          )}
        </div>

        <div className="gd-settings-card h-[320px] flex flex-col overflow-hidden">
          {currentList.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm opacity-60">
              {activeTab === 'active' ? 'Không có tệp nào đang tải' : 'Chưa có tệp nào hoàn tất'}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                    <th className="w-12 px-3 py-2" />
                    <th className="px-3 py-2">Tên tệp</th>
                    <th className="hidden px-3 py-2 sm:table-cell w-28 text-right">Tiến trình</th>
                    <th className="px-3 py-2 w-24 text-center">Trạng thái</th>
                    <th className="w-16 px-2 py-2" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {currentList.map((task) => (
                    <tr key={task.id} className="gd-row border-b border-[var(--gd-border)] hover:bg-[var(--gd-hover)] transition-colors">
                      <td className="px-3 py-3 text-center">
                        <TransferProgressRing progress={task.progress} status={task.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="break-all whitespace-normal font-medium text-[var(--gd-text)]">
                            {task.label}
                          </span>
                        </div>
                        {task.error && (
                          <div className="text-[11px] text-red-500 mt-0.5">
                            {task.error}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] sm:table-cell text-right">
                        {task.status === 'running' && (
                          <span className="text-[var(--gd-primary)] font-medium">
                            {Math.round((task.progress || 0) * 100)}%
                          </span>
                        )}
                        {task.status === 'done' && (
                          <span className="text-green-500 font-medium">100%</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {statusBadge(task.status)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="gd-row-actions justify-end shrink-0">
                          {(task.status === 'queued' || task.status === 'running') && (
                            <button
                              type="button"
                              className="gd-row-action text-[var(--gd-text-secondary)] hover:text-red-500"
                              onClick={() => transfers.cancel(task.id)}
                              title="Hủy"
                            >
                              <IconClose className="h-4 w-4" />
                            </button>
                          )}
                          {task.status === 'done' && task.metadata?.vaultPath && (
                            <button
                              type="button"
                              className="gd-row-action"
                              onClick={() => {
                                const vaultDir = task.metadata.vaultPath.substring(0, task.metadata.vaultPath.lastIndexOf('/'));
                                window.dispatchEvent(new CustomEvent('gd-navigate', { detail: vaultDir + '/' }));
                              }}
                              title="Mở thư mục"
                            >
                              <IconFolder className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
