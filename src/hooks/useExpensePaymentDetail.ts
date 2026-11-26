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
  /**
   * `versione` e `non_annullabile` (26/11/2026) servono al comando «Togli il pagamento»: la
   * versione è il controllo di concorrenza di `pagamento_costo_annulla`, il motivo spiega perché
   * una riga non si può togliere da qui (viene dalla banca, è già annullata, è una contropartita).
   */
  movimenti: { id: string; data: string; importo: number; direzione: string; banca: string | null; riferimento: string | null; storno_di: string | null; conto?: string | null; metodo?: string | null; bank_account_id?: string | null; fonte?: 'prima_nota' | 'banca' | 'prova'; versione?: string | null; non_annullabile?: string | null }[];
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

/** Un movimento di banca che il motore propone come pagamento (o prova) di questa fattura. */
export interface MovimentoBancaProposto {
  transaction_id: string; data: string; importo: number; conto: string; causale: string | null;
  chiave: string; forza: string; prova: boolean;
  righe: { tipo: string; id: string; importo: number; titolo: string | null; di_questo_costo: boolean }[];
}

/**
 * «C'è in banca» (23/11/2026): se il pagamento è già passato in banca va collegato, non
 * riscritto a mano — altrimenti risulta due volte. Solo proposte che riguardano questa fattura.
 */
export function usePagamentiBancaProposti(costId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['pagamento-costo-banca', costId, 'proposti'], enabled: enabled && !!costId,
    queryFn: async (): Promise<{ candidati: MovimentoBancaProposto[]; puo_collegare: boolean }> => {
      const { data, error } = await supabase.rpc('pagamenti_banca_candidati_costo' as never, { p_costo: costId! } as never);
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? { candidati: [], puo_collegare: false }) as unknown as { candidati: MovimentoBancaProposto[]; puo_collegare: boolean };
    }, staleTime: 0,
  });
}
