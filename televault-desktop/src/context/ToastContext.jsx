import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ToastHost } from '../components/ToastHost';
import { appLog } from '../utils/logger';

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, { variant = 'default', duration = 4000 } = {}) => {
    appLog(variant === 'error' ? 'error' : 'info', message);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
