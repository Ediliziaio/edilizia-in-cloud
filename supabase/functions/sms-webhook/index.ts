/**
 * Edge Function: sms-webhook
 * Riceve delivery receipt dal provider Brevo SMS.
 * Verifica firma HMAC prima di qualsiasi processing.
 * Aggiorna stato sms_log e gestisce opt-out automatico.
 * Risponde sempre 200 OK per evitare retry infiniti.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Verifica firma HMAC-SHA256 Brevo
async function verifyBrevoSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = hexToUint8Array(signature);
    return await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, messageData);
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

interface BrevoWebhookPayload {
  messageId?: string;
  message_id?: string;
  status?: string;
  event?: string;
  to?: string;
  content?: string;
  date?: string;
}

Deno.serve(async (req: Request) => {
  // Risponde sempre 200 per evitare retry del provider
  const okResponse = new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });

  if (req.method !== "POST") return okResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("BREVO_SMS_WEBHOOK_SECRET");

    const rawBody = await req.text();

    // Verifica firma HMAC se secret configurato
    if (webhookSecret) {
      const signature = req.headers.get("X-Brevo-Signature") ?? "";
      const isValid = await verifyBrevoSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error("[sms-webhook] Firma HMAC non valida, richiesta rifiutata");
        return okResponse; // 200 per evitare retry, ma senza processare
      }
    }

    const payload = JSON.parse(rawBody) as BrevoWebhookPayload;
    const messageId = payload.messageId ?? payload.message_id;
    const event = payload.status ?? payload.event ?? "";
    const telefono = payload.to ?? "";
    const contenutoRisposta = (payload.content ?? "").toUpperCase().trim();

    if (!messageId) return okResponse;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Mappa event Brevo → stato interno
    let nuovoStato: string | null = null;
    if (event === "delivered") nuovoStato = "consegnato";
    else if (event === "failed" || event === "undelivered") nuovoStato = "fallito";

    if (nuovoStato) {
      const { data: logRows } = await supabase
        .from("sms_log")
        .select("id, campagna_id, company_id")
        .eq("provider_message_id", String(messageId))
        .limit(1);

      if (logRows && logRows.length > 0) {
        const logRow = logRows[0];

        // Aggiorna log
        await supabase
          .from("sms_log")
          .update({
            stato: nuovoStato,
            consegnato_at: nuovoStato === "consegnato" ? new Date().toISOString() : null,
          })
          .eq("id", logRow.id);

        // Aggiorna contatori campagna
        if (logRow.campagna_id) {
          if (nuovoStato === "consegnato") {
            await supabase.rpc("increment_sms_campaign_delivered", {
              p_campagna_id: logRow.campagna_id,
            }).catch(() => {
              // RPC opzionale — ignora se non esiste
            });
          }
        }
      }
    }

    // Gestione opt-out automatico (risposta con "STOP")
    if (contenutoRisposta === "STOP" || contenutoRisposta.startsWith("STOP ")) {
      if (telefono) {
        await supabase
          .from("sms_contacts")
          .update({ opt_out: true, opt_out_data: new Date().toISOString() })
          .eq("telefono", telefono);

        // Aggiorna anche il log per questo numero se recente
        await supabase
          .from("sms_log")
          .update({ stato: "opt_out" })
          .eq("telefono", telefono)
          .in("stato", ["inviato", "consegnato", "pending"]);
      }
    }

    return okResponse;
  } catch (err) {
    console.error("[sms-webhook] Errore:", err);
    return okResponse; // Sempre 200
  }
});
