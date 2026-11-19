import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshFinancialQueries, refreshPurchasingQueries } from '@/lib/orders/financialRefresh';
import { useFinancialLive } from '@/hooks/useFinancialLive';

/**
 * Condivide i salvataggi fra schede e riceve i cambiamenti di altri utenti o
 * importazioni tramite il segnale aziendale Realtime. Il recupero periodico
 * controlla solo l'impronta del segnale: i dati finanziari vengono riletti
 * quando cambia, senza ripristinare il vecchio polling globale dei dati.
 */
export function FinancialRefreshBridge(): null {
  useFinancialLive();
  const client = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('eic-financial-commit');
    channel.onmessage = (message: MessageEvent<unknown>) => {
      const event = (message.data as { event?: string } | null)?.event;
      if (event === 'purchasing') refreshPurchasingQueries(client, false);
      else if (event === 'commit') refreshFinancialQueries(client, false);
    };
    return () => channel.close();
  }, [client]);
  return null;
}
