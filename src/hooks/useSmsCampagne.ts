/**
 * Hook per la gestione delle campagne SMS.
 * Include avvio campagna via Edge Function invia-sms.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type {
  SmsCampagna,
  SmsCampagnaFormData,
  SmsInvioResponse,
} from "@/types/sms-marketing";

const SMS_CAMPAGNE_KEY = "sms-campagne";

export function useSmsCampagne() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ─── Lista campagne ──────────────────────────────────────
  const { data: campagne = [], isLoading, error } = useQuery({
    queryKey: [SMS_CAMPAGNE_KEY, companyId],
    queryFn: async (): Promise<SmsCampagna[]> => {
      if (!companyId) return [];
      const { data, error: queryError } = await supabase
        .from("sms_campaigns")
        .select(
          "id, company_id, nome, messaggio, mittente, stato, tipo, programmata_per, totale_destinatari, inviati, consegnati, errori, costo_totale, filtro_tags, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (queryError) {
        console.error("[useSmsCampagne] list:", queryError);
        throw new Error("Impossibile caricare le campagne. Riprova tra qualche secondo.");
      }
      return (data ?? []) as SmsCampagna[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // ─── Singola campagna ────────────────────────────────────
  const getById = (id: string): SmsCampagna | null =>
    campagne.find((c) => c.id === id) ?? null;

  // ─── Crea campagna ───────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (formData: SmsCampagnaFormData): Promise<SmsCampagna> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error: insertError } = await supabase
        .from("sms_campaigns")
        .insert({
          company_id: companyId,
          nome: formData.nome,
          messaggio: formData.messaggio,
          mittente: formData.mittente,
          tipo: formData.tipo,
          stato: "bozza",
          programmata_per: formData.programmata_per,
          filtro_tags: formData.filtro_tags,
        })
        .select(
          "id, company_id, nome, messaggio, mittente, stato, tipo, programmata_per, totale_destinatari, inviati, consegnati, errori, costo_totale, filtro_tags, created_at, updated_at"
        )
        .single();
      if (insertError) {
        console.error("[useSmsCampagne] create:", insertError);
        throw new Error("Errore durante la creazione della campagna.");
      }
      return data as SmsCampagna;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_CAMPAGNE_KEY, companyId] });
      toast.success("Campagna creata con successo");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Avvia campagna via Edge Function ───────────────────
  const avviaMutation = useMutation({
    mutationFn: async (id: string): Promise<SmsInvioResponse> => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error: fnError } = await supabase.functions.invoke("invia-sms", {
        body: { campagna_id: id, company_id: companyId },
      });
      if (fnError) {
        console.error("[useSmsCampagne] avvia:", fnError);
        throw new Error("Errore durante l'avvio della campagna. Riprova tra qualche secondo.");
      }
      const resp = data as SmsInvioResponse;
      if (!resp.success) throw new Error(resp.error ?? "Errore sconosciuto durante l'invio.");
      return resp;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [SMS_CAMPAGNE_KEY, companyId] });
      toast.success(`Campagna avviata: ${result.inviati} SMS inviati, ${result.errori} errori`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Annulla campagna ────────────────────────────────────
  const annullaMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error: updateError } = await supabase
        .from("sms_campaigns")
        .update({ stato: "annullata" })
        .eq("id", id);
      if (updateError) {
        console.error("[useSmsCampagne] annulla:", updateError);
        throw new Error("Errore durante l'annullamento della campagna.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SMS_CAMPAGNE_KEY, companyId] });
      toast.success("Campagna annullata");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Conta destinatari con filtro tag ───────────────────
  const countDestinatari = async (filtroTags: string[]): Promise<number> => {
    if (!companyId) return 0;
    let q = supabase
      .from("sms_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("opt_out", false)
      .eq("consenso_marketing", true);
    if (filtroTags.length > 0) q = q.overlaps("tags", filtroTags);
    const { count, error: countError } = await q;
    if (countError) {
      console.error("[useSmsCampagne] countDestinatari:", countError);
      return 0;
    }
    return count ?? 0;
  };

  return {
    campagne,
    isLoading,
    error: error instanceof Error ? error.message : null,
    getById,
    create: (data: SmsCampagnaFormData) => createMutation.mutateAsync(data),
    avvia: (id: string) => avviaMutation.mutateAsync(id),
    annulla: (id: string) => annullaMutation.mutateAsync(id),
    countDestinatari,
    isCreating: createMutation.isPending,
    isAvviando: avviaMutation.isPending,
    isAnnullando: annullaMutation.isPending,
  };
}
