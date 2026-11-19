import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ExpensePaymentDetail {
  id: string; company_id: string; nome: string; totale: number; pagato: number; residuo: number; da_verificare: boolean;
  movimenti: { id: string; data: string; importo: number; direzione: string; banca: string | null; riferimento: string | null; storno_di: string | null; conto?: string | null; metodo?: string | null; bank_account_id?: string | null }[];
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
