/**
 * Hook React Query — PFN, Loans (mutui), Aging crediti/debiti.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PFNComponenti {
  cassa: number;
  banche_positive: number;
  banche_negative: number;
  mutui_mlt: number;
}
export interface PFNResult {
  meta: { company_id: string; anno: number; generato_il: string };
  pfn: number;
  componenti: PFNComponenti;
  serie: Array<{ label: string; pfn: number }>;
}
export function usePFN(anno: number) {
  return useQuery({
    queryKey: ["cg", "pfn", anno] as const,
    queryFn: async (): Promise<PFNResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_get_pfn_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as PFNResult;
    },
    staleTime: 60_000,
  });
}

// ── Loans CRUD ──────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  company_id: string;
  banca: string;
  descrizione: string | null;
  capitale_iniziale: number;
  capitale_residuo: number;
  tasso_pct: number;
  rata_mensile: number;
  durata_mesi: number;
  rate_pagate: number;
  data_inizio: string;
  data_fine: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export function useLoans() {
  return useQuery({
    queryKey: ["cg", "loans"] as const,
    queryFn: async (): Promise<Loan[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_loans")
        .select("*")
        .order("data_inizio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Loan[];
    },
    staleTime: 60_000,
  });
}

export interface LoanInput {
  id?: string;
  banca: string;
  descrizione?: string | null;
  capitale_iniziale: number;
  capitale_residuo: number;
  tasso_pct: number;
  rata_mensile: number;
  durata_mesi: number;
  rate_pagate: number;
  data_inizio: string;
  data_fine: string;
  is_active?: boolean;
  note?: string | null;
}
export function useUpsertLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoanInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_loans")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Loan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "loans"] });
      qc.invalidateQueries({ queryKey: ["cg", "pfn"] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow"] });
    },
  });
}
export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("cg_loans").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "loans"] });
      qc.invalidateQueries({ queryKey: ["cg", "pfn"] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow"] });
    },
  });
}

// ── Aging ──────────────────────────────────────────────────────────────────

export interface AgingFasce {
  a_scadere: number;
  sc_30: number;
  sc_60: number;
  sc_90: number;
  sc_oltre: number;
}
export interface AgingRiga {
  id: string;
  descrizione: string;
  due_date: string;
  residuo: number;
  fascia: keyof AgingFasce;
  controparte: string | null;
}
export interface AgingResult {
  direction: "in" | "out";
  totale: number;
  totale_scaduto: number;
  fasce: AgingFasce;
  n_aperte: number;
  n_scadute: number;
  righe: AgingRiga[];
}
export function useAging(direction: "in" | "out") {
  return useQuery({
    queryKey: ["cg", "aging", direction] as const,
    queryFn: async (): Promise<AgingResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_get_aging_safe", {
        p_direction: direction,
      });
      if (error) throw error;
      return data as unknown as AgingResult;
    },
    staleTime: 60_000,
  });
}
