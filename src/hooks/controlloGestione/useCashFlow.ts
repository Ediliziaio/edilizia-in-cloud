/**
 * Cash Flow Mensile Prospettico — hook React Query.
 *
 * RPC: cg_get_cash_flow_prospettico_safe(p_anno, p_mese_da, p_mese_a)
 * Replica lo schema Excel "OTP | Flusso Finanziario": ogni mese ha
 *   saldo iniziale, entrate breakdown, uscite breakdown, saldo finale.
 *
 * Inoltre espone CRUD per cg_cash_flow_manuali (voci editabili dall'utente).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CashFlowEntrateBreakdown {
  scadenze: number;
  manuali: number;
  fatture: number;
}

export interface CashFlowUsciteBreakdown {
  scadenze: number;
  personale: number;
  mutui: number;
  manuali: number;
  costi: number;
}

export interface CashFlowDettaglio {
  etichetta: string;
  importo: number;
}

export interface CashFlowMese {
  mese: number;
  saldo_inizio: number;
  entrate: CashFlowEntrateBreakdown;
  entrate_totali: number;
  uscite: CashFlowUsciteBreakdown;
  uscite_totali: number;
  saldo_fine: number;
  flusso_netto: number;
  sotto_zero: boolean;
  dettaglio_entrate: CashFlowDettaglio[];
  dettaglio_uscite: CashFlowDettaglio[];
}

export interface CashFlowResult {
  meta: {
    company_id: string;
    anno: number;
    mese_da: number;
    mese_a: number;
    saldo_apertura: number;
    saldo_chiusura: number;
    generato_il: string;
  };
  mesi: CashFlowMese[];
}

export function useCashFlow(anno: number, meseDa = 1, meseA = 12) {
  return useQuery({
    queryKey: ["cg", "cash-flow", anno, meseDa, meseA] as const,
    queryFn: async (): Promise<CashFlowResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "cg_get_cash_flow_prospettico_safe",
        { p_anno: anno, p_mese_da: meseDa, p_mese_a: meseA },
      );
      if (error) throw error;
      return data as unknown as CashFlowResult;
    },
    staleTime: 60_000,
  });
}

// ── CRUD voci manuali Cash Flow ─────────────────────────────────────────────

export interface CashFlowManuale {
  id: string;
  company_id: string;
  anno: number;
  mese: number;
  tipo: "entrata" | "uscita";
  categoria: string;
  descrizione: string;
  importo: number;
  ricorrente: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export function useCashFlowManuali(anno: number) {
  return useQuery({
    queryKey: ["cg", "cash-flow-manuali", anno] as const,
    queryFn: async (): Promise<CashFlowManuale[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("cg_cash_flow_manuali" as any)
        .select("*")
        .eq("anno", anno)
        .order("mese", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CashFlowManuale[];
    },
    staleTime: 60_000,
  });
}

export interface CashFlowManualeInput {
  anno: number;
  mese: number;
  tipo: "entrata" | "uscita";
  categoria: string;
  descrizione: string;
  importo: number;
  ricorrente?: boolean;
  note?: string | null;
}

export function useUpsertCashFlowManuale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CashFlowManualeInput & { id?: string; company_id?: string },
    ): Promise<CashFlowManuale> => {
      const payload = { ...input };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_cash_flow_manuali")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CashFlowManuale;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow-manuali", vars.anno] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow", vars.anno] });
    },
  });
}

export function useDeleteCashFlowManuale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("cg_cash_flow_manuali")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow-manuali"] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow"] });
    },
  });
}
