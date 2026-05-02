/**
 * Hook per la gestione delle campagne SMS.
 * Include avvio campagna via Edge Function invia-sms.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { calcolaPartiSms } from "@/lib/sms-utils";
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
          "id, company_id, nome, messaggio, mittente, stato, tipo, programmata_per, totale_destinatari, inviati, consegnati, errori, costo_totale, parti_sms, costo_per_sms_snapshot, costo_totale_cliente, filtro_tags, created_at, updated_at"
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
      const nome = formData.nome.trim();
      const messaggio = formData.messaggio.trim();
      const mittente = formData.mittente.trim();
      if (!nome) throw new Error("Il nome della campagna è obbligatorio.");
      if (!messaggio) throw new Error("Il messaggio è obbligatorio.");
      if (!/^[A-Za-z0-9]{1,11}$/.test(mittente)) {
        throw new Error("Il mittente deve contenere solo lettere e numeri, massimo 11 caratteri.");
      }
      if (formData.tipo === "pianificata") {
        if (!formData.programmata_per) throw new Error("Indica data e ora per pianificare la campagna.");
        if (new Date(formData.programmata_per).getTime() <= Date.now() + 60_000) {
          throw new Error("La data di invio deve essere futura.");
        }
      }
      const smsInfo = calcolaPartiSms(messaggio);
      const { data, error: insertError } = await supabase
        .from("sms_campaigns")
        .insert({
          company_id: companyId,
          nome,
          messaggio,
          mittente,
          tipo: formData.tipo,
          stato: formData.tipo === "pianificata" ? "pianificata" : "bozza",
          programmata_per: formData.programmata_per,
          filtro_tags: formData.filtro_tags,
          parti_sms: smsInfo.parti,
        })
        .select(
          "id, company_id, nome, messaggio, mittente, stato, tipo, programmata_per, totale_destinatari, inviati, consegnati, errori, costo_totale, parti_sms, costo_per_sms_snapshot, costo_totale_cliente, filtro_tags, created_at, updated_at"
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
      toast.success("Campagna salvata con successo");
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
      .select("telefono")
      .eq("company_id", companyId)
      .eq("opt_out", false)
      .eq("consenso_marketing", true);
    if (filtroTags.length > 0) q = q.overlaps("tags", filtroTags);
    const { data, error: countError } = await q;
    if (countError) {
      console.error("[useSmsCampagne] countDestinatari:", countError);
      return 0;
    }
    const numeriValidi = new Set(
      (data ?? [])
        .map((row) => String(row.telefono ?? "").trim())
        .filter((telefono) => /^\+\d{7,15}$/.test(telefono))
    );
    return numeriValidi.size;
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
