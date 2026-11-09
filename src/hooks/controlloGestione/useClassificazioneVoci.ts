/**
 * Hook React Query per gestire la tabella `cg_classificazione_voci`:
 * lista, update inline, attiva/disattiva, bootstrap iniziale.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

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
        // Solo QUESTA azienda: la sicurezza del database fa vedere al super admin
        // (e a chi ha più aziende) le righe di tutte, e il Controllo di Gestione
        // le sommava.
        .eq("company_id", companyId!)
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
      // Cambiare tipo F/V/Z o macro_voce ricalcola CE, BEP, SP, Rating, Indici,
      // Imposte, Budget e i dettagli mensili. Prima si invalidava solo il CE →
      // l'UI prometteva "aggiorna il BEP" ma il BEP restava fermo fino allo
      // staleTime. Invalidare l'intero namespace "cg" (prefix-match) tiene
      // coerenti tutte le tab dopo la modifica.
      qc.invalidateQueries({ queryKey: ["cg"] });
    },
    onError: (err) => toast.error(`Errore aggiornamento: ${(err as Error).message}`),
  });
}

/**
 * Le categorie di spesa che non hanno una voce del conto economico.
 *
 * Finiscono nella riga «Costi non classificati»: entrano nell'EBITDA, quindi
 * il margine è giusto, ma non si vede dove vanno i soldi. Qui si elencano
 * dalla più costosa, perché è da quella che conviene partire — e perché
 * alcune è giusto che restino fuori: l'acquisto di un terreno non è un costo
 * dell'anno.
 */
export interface VoceNonClassificata {
  source_table: SourceTable;
  source_value: string;
  righe: number;
  euro: number;
}

export function useVociNonClassificate(anno: number) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["cg", "voci-non-classificate", anno, companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<VoceNonClassificata[]> => {
      const { data, error } = await cgRpc<{ voci: VoceNonClassificata[] }>(
        "cg_voci_non_classificate",
        { p_anno: anno },
      );
      if (error) throw error;
      return data?.voci ?? [];
    },
    staleTime: 60_000,
  });
}

/** Dà una voce del conto economico a una categoria che non ne aveva. */
export function useClassificaVoce() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      sourceTable: SourceTable;
      sourceValue: string;
      macroVoce: MacroVoce;
      tipo: ClassTipo;
    }) => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("azienda non risolvibile");
      // La chiave la ricaviamo dal nome della categoria: resta leggibile in
      // Configurazione e non collide con le voci standard, che hanno nomi loro.
      const chiave = `cat_${input.sourceValue
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40)}`;
      const { error } = await supabase.from("cg_classificazione_voci").insert({
        company_id: companyId,
        voce_chiave: chiave,
        voce_descrizione: input.sourceValue,
        macro_voce: input.macroVoce,
        tipo: input.tipo,
        source_table: input.sourceTable,
        source_field: input.sourceTable === "manual" ? null : "category",
        source_value: input.sourceValue,
        ordering: 950,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria classificata: il conto economico si aggiorna");
      qc.invalidateQueries({ queryKey: queryKeys.controlloGestione.classificazione(effectiveCompany?.id) });
      qc.invalidateQueries({ queryKey: ["cg"] });
    },
    onError: (err) => toast.error(`Non è stato possibile classificarla: ${(err as Error).message}`),
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
