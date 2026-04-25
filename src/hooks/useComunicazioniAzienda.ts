import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ComunicazioneRow {
  id: string;
  tipo: "email" | "sms" | "notifica_inapp";
  oggetto: string | null;
  corpo: string;
  inviato_da_nome: string | null;
  /**
   * NB: `stato` rappresenta lo stato di delivery del provider esterno
   * (Resend/Twilio/etc). In questo flow di logging manuale, il record
   * viene salvato come "inviato" placeholder — l'invio REALE va integrato
   * separatamente via edge function e callback webhook che aggiornano
   * lo stato a "consegnato"/"fallito".
   */
  stato: "inviato" | "consegnato" | "fallito" | "in_coda";
  is_automatica: boolean;
  created_at: string;
}

export interface NuovaComunicazione {
  tipo: "email" | "sms" | "notifica_inapp";
  oggetto?: string;
  corpo: string;
  inviato_da_nome?: string;
}

export function useComunicazioniAzienda(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["comunicazioni-azienda", companyId],
    queryFn: async (): Promise<ComunicazioneRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("superadmin_comunicazioni")
        .select("id, tipo, oggetto, corpo, inviato_da_nome, stato, is_automatica, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[useComunicazioniAzienda]", error);
        throw new Error("Impossibile caricare le comunicazioni: " + error.message);
      }
      return (data ?? []) as ComunicazioneRow[];
    },
    enabled: !!companyId,
  });

  // FIX: typo nel nome export. Mantengo il vecchio come alias per retrocompat.
  const inviaComunicazione = useMutation({
    mutationFn: async (payload: NuovaComunicazione & { company_id: string }) => {
      const { error } = await supabase
        .from("superadmin_comunicazioni")
        .insert({
          company_id: payload.company_id,
          tipo: payload.tipo,
          oggetto: payload.oggetto ?? null,
          corpo: payload.corpo,
          inviato_da_nome: payload.inviato_da_nome ?? null,
          // FIX semantico: il record è solo un LOG, non un invio reale.
          // Stato "inviato" è placeholder finché non si integra il provider.
          // Mantengo "inviato" perché è quello che l'utente si aspetta vedere
          // nello storico, ma è chiarito nel modal con un disclaimer.
          stato: "inviato",
          is_automatica: false,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Comunicazione registrata", {
        description: "Salvata nello storico azienda. Per invio reale serve integrazione provider.",
      });
      queryClient.invalidateQueries({ queryKey: ["comunicazioni-azienda", companyId] });
      // Cross-tab: panoramica azienda potrebbe mostrare comunicazioni recenti
      queryClient.invalidateQueries({ queryKey: ["company-detail", companyId] });
    },
    onError: (err: Error) => {
      toast.error("Errore nell'invio della comunicazione", { description: err.message });
    },
  });

  return {
    comunicazioni: data ?? [],
    isLoading,
    isError,
    // Nome corretto + alias retrocompat (typo precedente). Entrambi puntano
    // alla stessa mutation — i call site esistenti continuano a funzionare.
    inviaComunicazione,
    inviaComuinicazione: inviaComunicazione,
  };
}
