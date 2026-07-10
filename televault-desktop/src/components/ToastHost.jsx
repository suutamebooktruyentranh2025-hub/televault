export function ToastHost({ toasts }) {
  if (toasts.length === 0) return null;

  return (
    <div className="gd-toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`gd-toast gd-toast--${toast.variant}`} role="status">
          {toast.message}
        </div>
      ))}
    </div>
  );
}
