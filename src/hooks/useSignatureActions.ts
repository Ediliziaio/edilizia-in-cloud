import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export interface SendSignatureParams {
  recipientEmail: string;
  recipientName: string;
  customMessage?: string;
  expiresDays: number;
}

/** Costruisce l'URL pubblico di firma (rotta /offerta/:token) dato il signature_token del preventivo. */
export function buildSignatureUrl(token: string): string {
  return `${window.location.origin}/offerta/${token}`;
}

async function resolveQuoteSignatureUrl(quoteId: string, legacyToken?: string | null): Promise<string | null> {
  const { data } = await supabase
    .from("signature_requests")
    .select("token")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.token) {
    return `${window.location.origin}/firma-fea/${data.token}`;
  }

  return legacyToken ? buildSignatureUrl(legacyToken) : null;
}

export function useSignatureActions(quoteId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(quoteId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
  };

  const sendForSignature = useMutation({
    mutationFn: async (params: SendSignatureParams) => {
      const { data, error } = await supabase.functions.invoke("send-quote-signature", {
        body: {
          quote_id: quoteId,
          recipient_email: params.recipientEmail,
          recipient_name: params.recipientName,
          custom_message: params.customMessage || undefined,
          expires_days: params.expiresDays,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Offerta inviata al cliente per la firma OTP");
      invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "errore sconosciuto";
      toast.error("Errore invio: " + message);
    },
  });

  /**
   * Apre WhatsApp con un messaggio pre-compilato contenente il link di firma.
   * Richiede che il preventivo abbia già un signature_token (status "inviata").
   */
  async function openWhatsApp(quote: {
    id: string;
    quote_number: string;
    client_name?: string | null;
    client_phone?: string | null;
    signature_token?: string | null;
    firma_digitale_abilitata?: boolean | null;
  }) {
    const signUrl = await resolveQuoteSignatureUrl(quote.id, quote.signature_token);
    if (!signUrl) {
      toast.error("Invia prima il preventivo per generare il link di firma");
      return;
    }
    const nomeCliente = quote.client_name || "Cliente";
    const msg = `Buongiorno ${nomeCliente},\n\nLe inviamo l'offerta commerciale ${quote.quote_number} da visionare e firmare online con codice OTP al seguente link:\n\n${signUrl}\n\nRimanendo a disposizione per qualsiasi informazione.\n\nCordiali saluti`;
    const encoded = encodeURIComponent(msg);
    // Normalize phone: remove spaces, dashes; keep leading +
    const rawPhone = (quote.client_phone || "").replace(/[\s\-()]/g, "");
    const phone = rawPhone.startsWith("+") ? rawPhone.slice(1) : rawPhone;
    const waUrl = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  /**
   * Copia il link di firma negli appunti.
   */
  async function copySignatureLink(quote: {
    id: string;
    signature_token?: string | null;
  }) {
    const url = await resolveQuoteSignatureUrl(quote.id, quote.signature_token);
    if (!url) {
      toast.error("Nessun link di firma disponibile. Invia prima il preventivo.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link di firma copiato negli appunti");
    } catch {
      toast.error("Impossibile copiare il link. Controlla i permessi del browser.");
    }
  }

  return { sendForSignature, openWhatsApp, copySignatureLink };
}
