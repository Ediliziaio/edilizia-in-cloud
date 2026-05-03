/**
 * Hook React Query — Valorizzazione magazzino + alert lotti scadenza.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Valorizzazione ──────────────────────────────────────────────────────────

export type ValorizzazioneMethod = "media" | "fifo" | "lifo";

export interface ArticoloValorizzato {
  id: string;
  name: string;
  internal_code: string | null;
  quantity: number;
  unit_cost: number;
  valore: number;
  ha_lotti: boolean;
  warehouse_id: string | null;
}

export interface ValorizzazioneResult {
  meta: {
    company_id: string;
    method: ValorizzazioneMethod;
    warehouse_id: string | null;
    generato_il: string;
  };
  kpi: {
    valore_totale: number;
    n_articoli: number;
    n_articoli_con_lotti: number;
    qty_totale: number;
  };
  articoli: ArticoloValorizzato[];
}

export function useValorizzazione(
  method: ValorizzazioneMethod = "media",
  warehouseId: string | null = null,
) {
  return useQuery({
    queryKey: ["wh", "valorizzazione", method, warehouseId] as const,
    queryFn: async (): Promise<ValorizzazioneResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "wh_get_valorizzazione",
        { p_method: method, p_warehouse_id: warehouseId },
      );
      if (error) throw error;
      return data as unknown as ValorizzazioneResult;
    },
    staleTime: 60_000,
  });
}

// ── Lotti in scadenza ───────────────────────────────────────────────────────

export type SeveritaScadenza = "scaduto" | "urgente" | "attenzione" | "ok";

export interface LottoScadenza {
  id: string;
  lot_number: string;
  articolo: string;
  internal_code: string | null;
  fornitore: string | null;
  expiry_date: string;
  giorni_residui: number;
  quantity: number;
  unit_cost: number | null;
  valore: number;
  severita: SeveritaScadenza;
}

export interface LottiScadenzaResult {
  meta: {
    company_id: string;
    days_ahead: number;
    data_riferimento: string;
    data_limite: string;
    generato_il: string;
  };
  kpi: {
    totale: number;
    scaduti: number;
    urgenti: number;
    attenzione: number;
    valore_a_rischio: number;
  };
  lotti: LottoScadenza[];
}

export function useLottiInScadenza(daysAhead = 30) {
  return useQuery({
    queryKey: ["wh", "lotti-scadenza", daysAhead] as const,
    queryFn: async (): Promise<LottiScadenzaResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "wh_get_lotti_in_scadenza",
        { p_days_ahead: daysAhead },
      );
      if (error) throw error;
      return data as unknown as LottiScadenzaResult;
    },
    staleTime: 5 * 60_000,
    // Refresh ogni 30 min per badge live
    refetchInterval: 30 * 60_000,
  });
}
