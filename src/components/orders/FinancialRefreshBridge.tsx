import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';

export function FinancialRefreshBridge(): null {
  const client = useQueryClient();
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eic-financial-commit') : null;
    const refresh = () => refreshFinancialQueries(client, false);
    if (channel) channel.onmessage = refresh;
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    // Recupero anche fra origini/sessioni diverse e dopo perdita di connessione.
    const interval = window.setInterval(onFocus, 30000);
    return () => { channel?.close(); clearInterval(interval); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); };
  }, [client]);
  return null;
}
