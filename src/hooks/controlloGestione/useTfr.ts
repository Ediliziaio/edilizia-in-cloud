/**
 * Fondo TFR: liquidazioni e anticipi (escono dal fondo) e dove va il TFR di
 * ogni dipendente (in azienda, fondo pensione, Fondo Tesoreria INPS). Lo Stato
 * patrimoniale li legge in private.cg_patrimonio_al e cg_tfr_movimenti_al.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export type TipoMovimentoTfr = "liquidazione" | "anticipo";
export type DestinazioneTfr = "azienda" | "fondo_pensione" | "tesoreria_inps";

export interface MovimentoTfr {
  id: string;
  employee_id: string | null;
  tipo: TipoMovimentoTfr;
  data: string;
  importo: number;
  note: string | null;
}

export interface DestinazioneTfrRow {
  employee_id: string;
  destinazione: DestinazioneTfr;
  dal: string;
}

export interface DipendenteTfr {
  id: string;
  nome: string;
  attivo: boolean;
}

// Le tabelle non sono nei tipi generati: un solo punto con il cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function invalidaCg(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["cg"] });
}

export function useMovimentiTfr() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "tfr-movimenti", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<MovimentoTfr[]> => {
      const { data, error } = await db
        .from("cg_tfr_movimenti")
        .select("id, employee_id, tipo, data, importo, note")
        .eq("company_id", companyId)
        .is("annullato_il", null)
        .order("data", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MovimentoTfr[];
    },
  });
}

export function useAggiungiMovimentoTfr() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (m: Omit<MovimentoTfr, "id">) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await db.from("cg_tfr_movimenti").insert({ ...m, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => invalidaCg(qc),
  });
}

/** Annulla una riga sbagliata: resta in archivio, non conta più. */
export function useAnnullaMovimentoTfr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("cg_tfr_movimenti")
        .update({ annullato_il: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidaCg(qc),
  });
}

export function useDestinazioniTfr() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "tfr-destinazioni", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<DestinazioneTfrRow[]> => {
      const { data, error } = await db
        .from("cg_tfr_destinazioni")
        .select("employee_id, destinazione, dal")
        .eq("company_id", companyId)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as DestinazioneTfrRow[];
    },
  });
}

export function useSalvaDestinazioneTfr() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (d: DestinazioneTfrRow) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await db
        .from("cg_tfr_destinazioni")
        .upsert({ ...d, company_id: companyId, updated_at: new Date().toISOString() }, { onConflict: "employee_id" });
      if (error) throw error;
    },
    onSuccess: () => invalidaCg(qc),
  });
}

/** Dipendenti dell'azienda (solo nome): vuoto per chi non può vederli. */
export function useDipendentiTfr() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "tfr-dipendenti", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<DipendenteTfr[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, is_active")
        .eq("company_id", companyId!)
        .order("last_name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id,
        nome: [e.last_name, e.first_name].filter(Boolean).join(" ") || "Senza nome",
        attivo: e.is_active !== false,
      }));
    },
  });
}
