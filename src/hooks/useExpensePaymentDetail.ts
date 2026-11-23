import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ExpensePaymentDetail {
  id: string; company_id: string; nome: string; totale: number; pagato: number; residuo: number; da_verificare: boolean;
  compensato?: number;
  puo_compensare?: boolean;
  /**
   * Per le fatture ricevute: la parte che risulta pagata (segnata nel gestionale di prima o a mano)
   * ma senza un movimento che lo provi. Un'informazione, non un allarme (23/11/2026).
   */
  senza_prova?: number;
  /**
   * `fonte`: «prima_nota» per i pagamenti registrati, «banca» per un movimento abbinato dalla
   * tesoreria, «prova» per il movimento che conferma un pagamento già segnato.
   */
  movimenti: { id: string; data: string; importo: number; direzione: string; banca: string | null; riferimento: string | null; storno_di: string | null; conto?: string | null; metodo?: string | null; bank_account_id?: string | null; fonte?: 'prima_nota' | 'banca' | 'prova' }[];
}

/** Riepilogo e finestra dei pagamenti condividono la stessa fonte e la stessa cache. */
export function useExpensePaymentDetail(costId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['pagamento-costo', costId], enabled: enabled && !!costId,
    queryFn: async (): Promise<ExpensePaymentDetail> => {
      const { data, error } = await supabase.rpc('dettaglio_pagamento_costo', { p_costo: costId! });
      if (error) throw new Error(error.message);
      return data as unknown as ExpensePaymentDetail;
    }, staleTime: 0,
  });
}
