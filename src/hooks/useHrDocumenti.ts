import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrDocumento } from "@/types/hrDocumenti";
import { calcStato } from "@/types/hrDocumenti";
import { toast } from "sonner";

const BUCKET = "hr-documenti";

/** Documenti/scadenze di un singolo dipendente. */
export function useHrDocumenti(profiloId: string | null | undefined) {
  return useQuery({
    queryKey: ["hr-documenti", profiloId],
    enabled: !!profiloId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documenti")
        .select("*")
        .eq("hr_profilo_id", profiloId!)
        .order("data_scadenza", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as HrDocumento[];
    },
    staleTime: 60 * 1000,
  });
}

/** Conteggi scadenze (scaduti / in scadenza) per profilo, per tutta l'azienda → badge lista. */
export function useHrScadenzeCounts() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["hr-scadenze-counts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documenti")
        .select("hr_profilo_id, data_scadenza, alert_giorni_prima")
        .eq("company_id", companyId!)
        .not("data_scadenza", "is", null);
      if (error) throw error;
      const map = new Map<string, { scaduti: number; inScadenza: number }>();
      for (const d of (data ?? []) as Array<{ hr_profilo_id: string; data_scadenza: string; alert_giorni_prima: number }>) {
        const stato = calcStato(d.data_scadenza, d.alert_giorni_prima);
        if (stato !== "scaduto" && stato !== "in_scadenza") continue;
        const cur = map.get(d.hr_profilo_id) ?? { scaduti: 0, inScadenza: 0 };
        if (stato === "scaduto") cur.scaduti++; else cur.inScadenza++;
        map.set(d.hr_profilo_id, cur);
      }
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** Upload file nel bucket privato hr-documenti → ritorna { path, name }. */
export async function uploadHrFile(companyId: string, profiloId: string, file: File): Promise<{ path: string; name: string }> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${companyId}/${profiloId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}

/** Link firmato temporaneo per scaricare/visualizzare un file. */
export async function getHrFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function useUpsertHrDocumento(profiloId: string) {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (doc: Partial<HrDocumento> & { id?: string }) => {
      const { id, created_at, updated_at, ...rest } = doc as any;
      // Stringhe vuote → null sui campi data per evitare errori.
      for (const f of ["data_rilascio", "data_scadenza", "titolo", "ente", "note", "file_path", "file_name"]) {
        if (rest[f] === "") rest[f] = null;
      }
      if (id) {
        const { error } = await supabase.from("hr_documenti").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
        const { error } = await supabase.from("hr_documenti").insert({
          ...rest, hr_profilo_id: profiloId, company_id: companyId, created_by: uid,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-documenti", profiloId] });
      qc.invalidateQueries({ queryKey: ["hr-scadenze-counts"] });
      toast.success("Documento salvato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore salvataggio documento"),
  });
}

export function useDeleteHrDocumento(profiloId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: HrDocumento) => {
      if (doc.file_path) { await supabase.storage.from(BUCKET).remove([doc.file_path]); }
      const { error } = await supabase.from("hr_documenti").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-documenti", profiloId] });
      qc.invalidateQueries({ queryKey: ["hr-scadenze-counts"] });
      toast.success("Documento eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore eliminazione"),
  });
}
