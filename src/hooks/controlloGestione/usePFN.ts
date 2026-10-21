/**
 * Hook React Query — PFN, Loans (mutui), Aging crediti/debiti.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

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
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "pfn", anno, "reconciled-v1", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PFNResult> => {
      const { data, error } = await cgRpc<PFNResult>("cg_get_pfn_safe", { p_anno: anno });
      if (error) throw error;
      // La RPC risponde per l'azienda della sessione sul server: se non è quella
      // scelta qui (azienda appena cambiata), non salviamo numeri di un'altra azienda.
      const pfn = data as PFNResult;
      if (pfn?.meta?.company_id && pfn.meta.company_id !== companyId)
        throw new Error("I dati sono arrivati per un'altra azienda: riprova tra un attimo.");
      return pfn;
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
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "loans", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Loan[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_loans")
        .select("*")
      // Solo QUESTA azienda: la sicurezza del database fa vedere al super admin
      // (e a chi ha più aziende) le righe di tutte, e il Controllo di Gestione
      // le sommava.
        .eq("company_id", companyId)
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
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: LoanInput) => {
      if (!companyId) throw new Error("Seleziona un'azienda prima di salvare il finanziamento.");
      // company_id è obbligatorio (NOT NULL, senza valore iniziale): senza, ogni
      // nuovo mutuo veniva rifiutato. Le colonne di servizio non si rimandano.
      const { created_at: _c, updated_at: _u, ...campi } = input as LoanInput & { created_at?: string; updated_at?: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_loans")
        .upsert({ ...campi, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data as Loan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cg", "loans"] });
      qc.invalidateQueries({ queryKey: ["cg", "pfn"] });
      qc.invalidateQueries({ queryKey: ["cg", "cash-flow"] });
      // SP prende i mutui MLT da cg_loans e gli Indici avanzati il DSCR dalle
      // rate: senza queste, dopo aver aggiunto/tolto un mutuo la SP mostrava i
      // vecchi mutui e il DSCR non cambiava (numeri incoerenti tra tab).
      qc.invalidateQueries({ queryKey: ["cg", "sp"] });
      qc.invalidateQueries({ queryKey: ["cg", "indici-avanzati"] });
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
      // SP prende i mutui MLT da cg_loans e gli Indici avanzati il DSCR dalle
      // rate: senza queste, dopo aver aggiunto/tolto un mutuo la SP mostrava i
      // vecchi mutui e il DSCR non cambiava (numeri incoerenti tra tab).
      qc.invalidateQueries({ queryKey: ["cg", "sp"] });
      qc.invalidateQueries({ queryKey: ["cg", "indici-avanzati"] });
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
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "aging", direction, "reconciled-v1", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AgingResult> => {
      const { data, error } = await cgRpc<AgingResult>("cg_get_aging_safe", {
        p_direction: direction,
      });
      if (error) throw error;
      return data as AgingResult;
    },
    staleTime: 60_000,
  });
}

// ── Conti che compongono la PFN ─────────────────────────────────────────────

export interface ContoPFN {
  id: string;
  nome: string;
  /** Saldo contabile: è quello che entra nella PFN (positivo = liquidità, negativo = scoperto). */
  saldo: number;
  /** Saldo disponibile dichiarato dalla banca: è quello da cui parte il Previsionale. */
  disponibile: number | null;
  aggiornato_al: string | null;
}

/** I conti attivi uno per uno, per vedere da dove vengono «Banche positive» e «Banche scoperte». */
export function useContiPFN() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "pfn-conti", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ContoPFN[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,display_name,account_name,current_balance,available_balance,balance_updated_at")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("current_balance", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        nome: c.display_name || c.account_name || "Conto senza nome",
        saldo: Number(c.current_balance ?? 0),
        disponibile: c.available_balance == null ? null : Number(c.available_balance),
        aggiornato_al: c.balance_updated_at,
      }));
    },
    staleTime: 60_000,
  });
}
