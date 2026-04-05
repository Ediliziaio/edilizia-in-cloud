/**
 * Hook CRUD per i contatti SMS.
 * Gestisce list, create, update, remove e importCsv.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { SmsContatto, SmsContattoFormData } from "@/types/sms-marketing";

const SMS_CONTATTI_KEY = "sms-contatti";

interface SmsContattoFiltri {
  search?: string;
  tags?: string[];
  soloPropri?: boolean; // solo attivi (opt_out=false)
  soloOptOut?: boolean;
}

export function useSmsContatti(filtri?: SmsContattoFiltri) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ─── Lista contatti ──────────────────────────────────────
  const { data: contatti = [], isLoading, error } = useQuery({
    queryKey: [SMS_CONTATTI_KEY, companyId, filtri],
    queryFn: async (): Promise<SmsContatto[]> => {
      if (!companyId) return [];

      let q = supabase
        .from("sms_contacts")
        .select(
          "id, company_id, nome, cognome, telefono, telefono_verified, consenso_marketing, consenso_data, opt_out, opt_out_data, tags, note, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (filtri?.soloPropri) q = q.eq("opt_out", false);
      if (filtri?.soloOptOut) q = q.eq("opt_out", true);
      if (filtri?.tags && filtri.tags.length > 0) q = q.overlaps("tags", filtri.tags);
      if (filtri?.search) {
        q = q.or(
          `nome.ilike.%${filtri.search}%,cognome.ilike.%${filtri.search}%,telefono.ilike.%${filtri.search}%`
        );
      }

      const { data, error: queryError } = await q;
      if (queryError) {
        console.error("[useSmsContatti] list:", queryError);
        throw new Error("Impossibile caricare i contatti. Riprova tra qualche secondo.");
      }
      return (data ?? []) as SmsContatto[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Crea contatto ───────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (formData: SmsContattoFormData): Promise<SmsContatto> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error: insertError } = await supabase
        .from("sms_contacts")
        .insert({
          company_id: companyId,
          nome: formData.nome || null,
          cognome: formData.cognome || null,
          telefono: formData.telefono,
          consenso_marketing: formData.consenso_marketing,
          consenso_data: formData.consenso_marketing ? new Date().toISOString() : null,
          tags: formData.tags,
          note: formData.note || null,
        })
        .select(
          "id, company_id, nome, cognome, telefono, telefono_verified, consenso_marketing, consenso_data, opt_out, opt_out_data, tags, note, created_at, updated_at"
        )
        .single();
      if (insertError) {
        console.error("[useSmsContatti] create:", insertError);
        if (insertError.code === "23505") throw new Error("Numero di telefono già presente per questa azienda.");
        throw new Error("Errore durante il salvataggio del contatto.");
      }
      return data as SmsContatto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_CONTATTI_KEY, companyId] });
      toast.success("Contatto aggiunto con successo");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Aggiorna contatto ───────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: SmsContattoFormData }): Promise<SmsContatto> => {
      const { data, error: updateError } = await supabase
        .from("sms_contacts")
        .update({
          nome: formData.nome || null,
          cognome: formData.cognome || null,
          telefono: formData.telefono,
          consenso_marketing: formData.consenso_marketing,
          consenso_data: formData.consenso_marketing ? new Date().toISOString() : null,
          tags: formData.tags,
          note: formData.note || null,
        })
        .eq("id", id)
        .select(
          "id, company_id, nome, cognome, telefono, telefono_verified, consenso_marketing, consenso_data, opt_out, opt_out_data, tags, note, created_at, updated_at"
        )
        .single();
      if (updateError) {
        console.error("[useSmsContatti] update:", updateError);
        throw new Error("Errore durante l'aggiornamento del contatto.");
      }
      return data as SmsContatto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_CONTATTI_KEY, companyId] });
      toast.success("Contatto aggiornato");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Elimina contatto ────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error: deleteError } = await supabase
        .from("sms_contacts")
        .delete()
        .eq("id", id);
      if (deleteError) {
        console.error("[useSmsContatti] remove:", deleteError);
        throw new Error("Errore durante l'eliminazione del contatto.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_CONTATTI_KEY, companyId] });
      toast.success("Contatto eliminato");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Import CSV ──────────────────────────────────────────
  const importCsvMutation = useMutation({
    mutationFn: async (file: File): Promise<{ importati: number; errori: number }> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) throw new Error("Il file CSV è vuoto o non valido.");

      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const rows = lines.slice(1);
      let importati = 0;
      let erroriCount = 0;

      for (const row of rows) {
        const cols = row.split(",").map((c) => c.trim().replace(/"/g, ""));
        const obj: Record<string, string> = {};
        header.forEach((h, i) => { obj[h] = cols[i] ?? ""; });

        const telefono = obj["telefono"] ?? obj["phone"] ?? "";
        if (!telefono || !telefono.startsWith("+")) {
          erroriCount++;
          continue;
        }

        const { error: insertErr } = await supabase
          .from("sms_contacts")
          .upsert(
            {
              company_id: companyId,
              telefono,
              nome: obj["nome"] ?? obj["name"] ?? null,
              cognome: obj["cognome"] ?? obj["surname"] ?? null,
              consenso_marketing: (obj["consenso"] ?? obj["consent"] ?? "false").toLowerCase() === "true",
            },
            { onConflict: "company_id,telefono" }
          );

        if (insertErr) erroriCount++;
        else importati++;
      }

      return { importati, errori: erroriCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [SMS_CONTATTI_KEY, companyId] });
      toast.success(`Import completato: ${result.importati} importati, ${result.errori} errori`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    contatti,
    isLoading,
    error: error instanceof Error ? error.message : null,
    create: (data: SmsContattoFormData) => createMutation.mutateAsync(data),
    update: (id: string, data: SmsContattoFormData) => updateMutation.mutateAsync({ id, data }),
    remove: (id: string) => removeMutation.mutateAsync(id),
    importCsv: (file: File) => importCsvMutation.mutateAsync(file),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
    isImporting: importCsvMutation.isPending,
  };
}
