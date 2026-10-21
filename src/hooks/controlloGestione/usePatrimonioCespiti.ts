/**
 * Patrimonio netto e cespiti: i due dati di partenza che lo Stato patrimoniale
 * e gli ammortamenti richiedono e che il Health-check segnala come critici.
 * Prima non esisteva nessuna pagina per inserirli: il wizard del Health-check
 * portava a /azienda/dati-azienda e /azienda/cespiti, che non esistono.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface PatrimonioNettoRow {
  id?: string;
  esercizio: number;
  capitale_sociale: number;
  riserva_legale: number;
  riserva_straordinaria: number;
  altre_riserve: number;
  utili_perdite_a_nuovo: number;
  utile_perdita_esercizio: number;
  fondo_tfr: number;
  fondo_rischi: number;
  altri_fondi: number;
  note: string | null;
}

export interface CespiteRow {
  id: string;
  descrizione: string;
  categoria: string;
  data_acquisto: string;
  costo_storico: number;
  aliquota_amm: number;
  fondo_amm: number;
  is_active: boolean;
}

// Le tabelle non sono nei tipi generati: un solo punto con il cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function invalidaCg(qc: ReturnType<typeof useQueryClient>) {
  // Patrimonio e cespiti cambiano SP, CE (ammortamenti), rating, indici, health.
  qc.invalidateQueries({ queryKey: ["cg"] });
}

export function usePatrimonioNetto(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "patrimonio-netto", anno, companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PatrimonioNettoRow | null> => {
      const { data, error } = await db
        .from("patrimonio_netto")
        .select("id, esercizio, capitale_sociale, riserva_legale, riserva_straordinaria, altre_riserve, utili_perdite_a_nuovo, utile_perdita_esercizio, fondo_tfr, fondo_rischi, altri_fondi, note")
        .eq("company_id", companyId)
        .eq("esercizio", anno)
        .maybeSingle();
      if (error) throw error;
      return (data as PatrimonioNettoRow | null) ?? null;
    },
  });
}

export function useSalvaPatrimonioNetto() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (row: Omit<PatrimonioNettoRow, "id">) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await db
        .from("patrimonio_netto")
        .upsert({ ...row, company_id: companyId, fonte: "manuale" }, { onConflict: "company_id,esercizio" });
      if (error) throw error;
    },
    onSuccess: () => invalidaCg(qc),
  });
}

export function useCespiti() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "cespiti", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CespiteRow[]> => {
      const { data, error } = await db
        .from("cespiti")
        .select("id, descrizione, categoria, data_acquisto, costo_storico, aliquota_amm, fondo_amm, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("data_acquisto", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CespiteRow[];
    },
  });
}

export interface NuovoCespite {
  descrizione: string;
  categoria: string;
  data_acquisto: string;
  costo_storico: number;
  aliquota_amm: number;
  fondo_amm: number;
}

export function useAggiungiCespite() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (c: NuovoCespite) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await db.from("cespiti").insert({ ...c, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => invalidaCg(qc),
  });
}

/** Toglie un cespite dal calcolo (non lo cancella: resta in archivio). */
export function useDismettiCespite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("cespiti")
        .update({ is_active: false, data_dismissione: new Date().toLocaleDateString("en-CA") })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidaCg(qc),
  });
}
