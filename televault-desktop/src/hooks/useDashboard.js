import { useCallback, useEffect, useState } from 'react';

const vaultApi = window.televault?.vault;

export function useDashboard({ enabled = true, rangeDays = 30 } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled || !vaultApi?.getDashboard) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await vaultApi.getDashboard(rangeDays);
      if (!result?.ok) {
        setError(result?.error || 'failed');
        setStats(null);
      } else {
        setStats(result.stats);
      }
    } catch (e) {
      setError(String(e.message || e));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, rangeDays]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !vaultApi?.onChanged) return undefined;
    const unsub = vaultApi.onChanged(() => void reload());
    return unsub;
  }, [enabled, reload]);

  return { stats, loading, error, reload };
}
