/**
 * Hook React Query per gestire la tabella `cg_classificazione_voci`:
 * lista, update inline, attiva/disattiva, bootstrap iniziale.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export type MacroVoce =
  | "ricavi"
  | "acquisti_materie"
  | "costi_produttivi"
  | "costo_personale"
  | "costi_commerciali"
  | "costi_amministrativi"
  | "ammortamenti"
  | "oneri_tributari"
  | "oneri_finanziari"
  | "proventi_finanziari"
  | "ricavi_extra"
  | "costi_extra";

export type ClassTipo = "F" | "V" | "Z";

export type SourceTable = "company_costs" | "bank_transactions" | "invoices" | "prima_nota" | "manual";

export interface ClassificazioneVoce {
  id: string;
  company_id: string;
  voce_chiave: string;
  voce_descrizione: string;
  macro_voce: MacroVoce;
  tipo: ClassTipo;
  source_table: SourceTable;
  source_field: string | null;
  source_value: string | null;
  ordering: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Etichette user-friendly per le macro_voce. */
export const MACRO_VOCE_LABELS: Record<MacroVoce, string> = {
  ricavi: "Ricavi",
  acquisti_materie: "Acquisti materie",
  costi_produttivi: "Costi produttivi",
  costo_personale: "Costo del personale",
  costi_commerciali: "Costi commerciali",
  costi_amministrativi: "Costi amministrativi",
  ammortamenti: "Ammortamenti",
  oneri_tributari: "Oneri tributari",
  oneri_finanziari: "Oneri finanziari",
  proventi_finanziari: "Proventi finanziari",
  ricavi_extra: "Ricavi extra-gestionali",
  costi_extra: "Costi extra-gestionali",
};

export const TIPO_LABELS: Record<ClassTipo, string> = {
  F: "Fissa",
  V: "Variabile",
  Z: "Extra (Z)",
};

export const SOURCE_LABELS: Record<SourceTable, string> = {
  company_costs: "Costi azienda",
  bank_transactions: "Movimenti banca",
  invoices: "Fatture",
  prima_nota: "Prima Nota",
  manual: "Manuale (cespiti)",
};

export function useClassificazioneVoci() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.controlloGestione.classificazione(companyId),
    queryFn: async (): Promise<ClassificazioneVoce[]> => {
      const { data, error } = await supabase
        .from("cg_classificazione_voci")
        .select("*")
        .order("ordering", { ascending: true })
        .order("voce_chiave", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassificazioneVoce[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useUpdateClassificazione() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Pick<ClassificazioneVoce, "voce_descrizione" | "macro_voce" | "tipo" | "is_active" | "ordering">> }) => {
      const { error } = await supabase
        .from("cg_classificazione_voci")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.controlloGestione.classificazione(effectiveCompany?.id) });
      qc.invalidateQueries({ queryKey: ["cg", "ce"] });
    },
    onError: (err) => toast.error(`Errore aggiornamento: ${(err as Error).message}`),
  });
}

export function useBootstrapClassificazione() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        inserted: number;
        alreadyPresent: number;
        total: number;
      }>("cg-bootstrap-classificazione", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Classificazione caricata: ${data?.inserted ?? 0} nuove voci, ${data?.alreadyPresent ?? 0} già presenti`);
      qc.invalidateQueries({ queryKey: queryKeys.controlloGestione.classificazione(effectiveCompany?.id) });
    },
    onError: (err) => toast.error(`Errore bootstrap: ${(err as Error).message}`),
  });
}
