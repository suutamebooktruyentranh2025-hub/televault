import { useState, useEffect, useCallback } from 'react';

export function useLogs(maxLogs = 300) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    function handleLog(e) {
      setLogs((prev) => {
        const next = [...prev, e.detail];
        if (next.length > maxLogs) return next.slice(next.length - maxLogs);
        return next;
      });
    }
    window.addEventListener('app-log', handleLog);
    return () => window.removeEventListener('app-log', handleLog);
  }, [maxLogs]);

  const clearLogs = useCallback(() => setLogs([]), []);
  return { logs, clearLogs };
}
