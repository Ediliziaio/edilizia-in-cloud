import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrDocumento } from "@/types/hrDocumenti";
import { calcStato } from "@/types/hrDocumenti";
import { toast } from "sonner";
import { readAllPages } from "@/lib/personale/readAllPages";

const BUCKET = "hr-documenti";

/** Documenti/scadenze di un singolo dipendente. */
export function useHrDocumenti(profiloId: string | null | undefined) {
  return useQuery({
    queryKey: ["hr-documenti", profiloId],
    enabled: !!profiloId,
    queryFn: async ({ signal }) => {
      const data = await readAllPages((from, to) => supabase
        .from("hr_documenti")
        .select("*")
        .eq("hr_profilo_id", profiloId!)
        .order("data_scadenza", { ascending: true, nullsFirst: false }).order("id").range(from, to).abortSignal(signal));
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
    queryFn: async ({ signal }) => {
      const data = await readAllPages((from, to) => supabase
        .from("hr_documenti")
        .select("hr_profilo_id, data_scadenza, alert_giorni_prima")
        .eq("company_id", companyId!)
        .not("data_scadenza", "is", null).order("id").range(from, to).abortSignal(signal));
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

/**
 * Scadenze documenti di TUTTA l'azienda, con il nome della persona.
 * Serve alla vista "Scadenze globali" di Personale → Documenti, che prima
 * leggeva `documenti_operai`: una tabella diversa da quella dei badge e della
 * scheda profilo, per giunta su un bucket storage mai creato.
 */
export interface ScadenzaAzienda {
  id: string;
  hr_profilo_id: string;
  persona: string;
  mansione: string | null;
  categoria: string;
  titolo: string | null;
  data_scadenza: string;
  alert_giorni_prima: number;
  stato: ReturnType<typeof calcStato>;
  file_path: string | null;
}

export function useHrScadenzeAzienda() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["hr-scadenze-azienda", companyId],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const data = await readAllPages((from, to) => supabase
        .from("hr_documenti")
        .select("id, hr_profilo_id, categoria, titolo, data_scadenza, alert_giorni_prima, file_path, hr_profili!inner(nome, cognome, mansione)")
        .eq("company_id", companyId!)
        .not("data_scadenza", "is", null)
        .order("data_scadenza", { ascending: true }).order("id").range(from, to).abortSignal(signal));
      type Row = {
        id: string; hr_profilo_id: string; categoria: string; titolo: string | null;
        data_scadenza: string; alert_giorni_prima: number; file_path: string | null;
        hr_profili: { nome: string | null; cognome: string | null; mansione: string | null } | null;
      };
      return ((data ?? []) as unknown as Row[]).map((d): ScadenzaAzienda => ({
        id: d.id,
        hr_profilo_id: d.hr_profilo_id,
        persona: [d.hr_profili?.nome, d.hr_profili?.cognome].filter(Boolean).join(" ") || "—",
        mansione: d.hr_profili?.mansione ?? null,
        categoria: d.categoria,
        titolo: d.titolo,
        data_scadenza: d.data_scadenza,
        alert_giorni_prima: d.alert_giorni_prima,
        stato: calcStato(d.data_scadenza, d.alert_giorni_prima),
        file_path: d.file_path,
      }));
    },
    staleTime: 60 * 1000,
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
      if (!companyId || !profiloId) throw new Error("Azienda o persona non disponibile");
      const { id, created_at, updated_at, ...rest } = doc as any;
      // Stringhe vuote → null sui campi data per evitare errori.
      for (const f of ["data_rilascio", "data_scadenza", "titolo", "ente", "note", "file_path", "file_name"]) {
        if (rest[f] === "") rest[f] = null;
      }
      if (id) {
        // Never accept company/person reassignment through a document form.
        delete rest.company_id; delete rest.hr_profilo_id; delete rest.created_by;
        const { error } = await supabase.from("hr_documenti").update(rest).eq("id", id).eq("company_id", companyId).eq("hr_profilo_id", profiloId).select("id").single();
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
      qc.invalidateQueries({ queryKey: ["qualifiche-addetto", companyId] });
      qc.invalidateQueries({ queryKey: ["addetti-qualifiche-commessa", companyId] }); qc.invalidateQueries({ queryKey: ["pos-riesame-proprio", companyId] });
      qc.invalidateQueries({ queryKey: ["hr-scadenze-counts"] });
      qc.invalidateQueries({ queryKey: ["hr-scadenze-azienda"] });
      toast.success("Documento salvato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore salvataggio documento"),
  });
}

export function useDeleteHrDocumento(profiloId: string) {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (doc: HrDocumento) => {
      if (!companyId || doc.company_id !== companyId || doc.hr_profilo_id !== profiloId) throw new Error("Documento non valido per questa persona");
      // Remove the record before its blob: a rejected DB deletion must not destroy the attachment.
      const { error } = await supabase.from("hr_documenti").delete().eq("id", doc.id).eq("company_id", companyId).eq("hr_profilo_id", profiloId).select("id").single();
      if (error) throw error;
      if (doc.file_path) {
        const result = await supabase.storage.from(BUCKET).remove([doc.file_path]);
        if (result.error) toast.warning("Documento rimosso dall'elenco; pulizia del file da riprovare.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-documenti", profiloId] });
      qc.invalidateQueries({ queryKey: ["qualifiche-addetto", companyId] });
      qc.invalidateQueries({ queryKey: ["addetti-qualifiche-commessa", companyId] }); qc.invalidateQueries({ queryKey: ["pos-riesame-proprio", companyId] });
      qc.invalidateQueries({ queryKey: ["hr-scadenze-counts"] });
      qc.invalidateQueries({ queryKey: ["hr-scadenze-azienda"] });
      toast.success("Documento eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore eliminazione"),
  });
}
