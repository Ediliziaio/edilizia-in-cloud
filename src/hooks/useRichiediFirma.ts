import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RichiediFirmaInput {
  tipo_documento: "order" | "quote" | "sessione" | "odv";
  documento_id: string;
  tipo_firmatario: "b2b" | "b2c";
  signer_email: string;
  signer_name: string;
  scadenza_giorni?: number;
}

export interface RichiediFirmaResult {
  token: string;
  firma_link: string;
  request_id: string;
  otp_inviato: boolean;
}

/**
 * Invoca l'edge function `fea-richiedi-firma`.
 * Ritorna il token del signature_request e il link /firma-fea/{token}
 * da inviare al firmatario via email/WhatsApp.
 */
export function useRichiediFirma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RichiediFirmaInput): Promise<RichiediFirmaResult> => {
      const { data, error } = await supabase.functions.invoke("fea-richiedi-firma", {
        body: input,
      });
      if (error) throw new Error(error.message);
      if (!data?.token) throw new Error("Risposta server non valida (token mancante)");
      const origin = window.location.origin;
      return {
        token: data.token,
        firma_link: `${origin}/firma-fea/${data.token}`,
        request_id: data.request_id ?? data.id ?? "",
        otp_inviato: data.otp_inviato ?? data.otp_sent ?? false,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documento-sessioni"] });
      qc.invalidateQueries({ queryKey: ["signature-requests"] });
    },
    onError: (e: Error) => toast.error(`Errore invio richiesta firma: ${e.message}`),
  });
}
