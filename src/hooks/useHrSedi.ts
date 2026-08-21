import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrSede } from "@/types/hr";
import { toast } from "sonner";

export function useHrSedi() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-sedi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_sedi")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome");
      if (error) throw error;
      return (data || []) as HrSede[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateHrSede() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<HrSede>) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase.from("hr_sedi").insert({
        company_id: companyId,
        nome: data.nome || "",
        indirizzo: data.indirizzo ?? null,
        citta: data.citta ?? null,
        provincia: data.provincia ?? null,
        cap: data.cap ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        raggio_mt: data.raggio_mt ?? 200,
        attiva: data.attiva ?? true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede creata con successo");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useUpdateHrSede() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<HrSede> & { id: string }) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase
        .from("hr_sedi")
        .update({
          nome: data.nome,
          indirizzo: data.indirizzo,
          citta: data.citta,
          provincia: data.provincia,
          cap: data.cap,
          lat: data.lat,
          lng: data.lng,
          raggio_mt: data.raggio_mt,
          attiva: data.attiva,
        } as any)
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede aggiornata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useDeleteHrSede() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("companyId required");

      const { count, error: countError } = await supabase
        .from("hr_profili")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("sede_id", id);

      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error("Non puoi eliminare una sede assegnata a profili HR. Disattivala o sposta prima i profili.");
      }

      const { error } = await supabase
        .from("hr_sedi")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede eliminata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

/**
 * Importa in hr_sedi le "Sedi aziendali" (tabella `sedi`, quella di
 * Impostazioni/commesse/marketing) che l'HR non vede: DUE anagrafiche
 * parallele, e chi creava la sede "di là" si sentiva dire dall'HR che
 * non esistevano sedi. Copia solo quelle attive non ancora presenti
 * (match per nome), raggio GPS default 200 m.
 */
export function useImportaSediAziendali() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("companyId required");
      const [{ data: aziendali, error: e1 }, { data: esistenti, error: e2 }] = await Promise.all([
        supabase
          .from("sedi")
          .select("nome, indirizzo, citta, provincia, cap, lat, lng")
          .eq("company_id", companyId)
          .eq("attiva", true),
        supabase.from("hr_sedi").select("nome").eq("company_id", companyId),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const nomiEsistenti = new Set((esistenti || []).map((s) => (s.nome || "").trim().toLowerCase()));
      const daImportare = (aziendali || []).filter(
        (s) => s.nome && !nomiEsistenti.has(s.nome.trim().toLowerCase()),
      );
      if (daImportare.length === 0) return 0;

      const { error: insErr } = await supabase.from("hr_sedi").insert(
        daImportare.map((s) => ({
          company_id: companyId,
          nome: s.nome,
          indirizzo: s.indirizzo ?? null,
          citta: s.citta ?? null,
          provincia: s.provincia ?? null,
          cap: s.cap ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          raggio_mt: 200,
          attiva: true,
        })) as any,
      );
      if (insErr) throw insErr;
      return daImportare.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      qc.invalidateQueries({ queryKey: ["hr-regia-sedi"] });
      toast.success(
        n === 0
          ? "Nessuna sede nuova da importare"
          : `${n} sed${n === 1 ? "e importata" : "i importate"} dalle Sedi aziendali`,
      );
    },
    onError: (e: any) => toast.error("Errore import sedi: " + e.message),
  });
}
