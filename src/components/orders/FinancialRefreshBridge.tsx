import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';

/**
 * Quando un'altra scheda salva un fatto economico (refreshFinancialQueries la
 * avvisa sul canale), questa ricarica i suoi lettori.
 *
 * Fino al 31/10/2026 lo faceva anche ogni 30 secondi e a ogni ritorno sulla
 * scheda: ogni scheda aperta ricaricava tutte le query finanziarie attive (sulla
 * pagina Costi una dozzina, una senza limite), scavalcando lo staleTime di 5
 * minuti. Era il carico che saturava il database con un solo browser aperto.
 * Il salvataggio nella stessa scheda invalida già da sé (refreshFinancialQueries).
 */
export function FinancialRefreshBridge(): null {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('eic-financial-commit');
    channel.onmessage = () => refreshFinancialQueries(client, false);
    return () => channel.close();
  }, [client]);
  return null;
}
