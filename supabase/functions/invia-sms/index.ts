/**
 * Edge Function: invia-sms
 * Invia una campagna SMS via Brevo SMS API.
 * Riceve POST autenticato con { campagna_id, company_id }.
 * Filtra contatti: opt_out=false AND consenso_marketing=true.
 * Rate limit: max 10 SMS/secondo con sleep tra batch.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const BREVO_API_URL = "https://api.brevo.com/v3/transactionalSMS/sms";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000; // 1 secondo tra batch (max 10 SMS/sec)

interface InviaSmsRequest {
  campagna_id: string;
  company_id: string;
}

interface BrevoSmsPayload {
  sender: string;
  recipient: string;
  content: string;
  type: string;
  tag?: string;
}

interface BrevoSmsResponse {
  reference: string;
  messageId: number;
  smsCount: number;
  usedCredits: number;
  remainingCredits: number;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Autenticazione JWT Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Autenticazione richiesta" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const brevoApiKey = Deno.env.get("BREVO_SMS_API_KEY");

    if (!brevoApiKey) {
      return new Response(
        JSON.stringify({ error: "Provider SMS non configurato. Contatta l'amministratore." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as InviaSmsRequest;
    const { campagna_id, company_id } = body;

    if (!campagna_id || !company_id) {
      return new Response(
        JSON.stringify({ error: "campagna_id e company_id sono obbligatori" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Carica la campagna
    const { data: campagna, error: campagnaError } = await supabase
      .from("sms_campaigns")
      .select("id, nome, messaggio, mittente, stato, filtro_tags, company_id")
      .eq("id", campagna_id)
      .eq("company_id", company_id)
      .single();

    if (campagnaError || !campagna) {
      return new Response(
        JSON.stringify({ error: "Campagna non trovata" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (campagna.stato !== "bozza" && campagna.stato !== "pianificata") {
      return new Response(
        JSON.stringify({ error: `Campagna non avviabile (stato: ${campagna.stato})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggiorna stato campagna a in_corso
    await supabase
      .from("sms_campaigns")
      .update({ stato: "in_corso" })
      .eq("id", campagna_id);

    // Costruisce query contatti con filtro tag opzionale
    let contattiQuery = supabase
      .from("sms_contacts")
      .select("id, telefono, nome, cognome")
      .eq("company_id", company_id)
      .eq("opt_out", false)
      .eq("consenso_marketing", true);

    if (campagna.filtro_tags && campagna.filtro_tags.length > 0) {
      contattiQuery = contattiQuery.overlaps("tags", campagna.filtro_tags);
    }

    const { data: contatti, error: contattiError } = await contattiQuery;

    if (contattiError) {
      console.error("[invia-sms] Errore caricamento contatti:", contattiError);
      await supabase
        .from("sms_campaigns")
        .update({ stato: "annullata" })
        .eq("id", campagna_id);
      return new Response(
        JSON.stringify({ error: "Errore nel caricamento dei contatti" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const destinatari = contatti ?? [];
    let inviati = 0;
    let errori = 0;
    let costoTotale = 0;

    // Aggiorna totale destinatari
    await supabase
      .from("sms_campaigns")
      .update({ totale_destinatari: destinatari.length })
      .eq("id", campagna_id);

    // Invio in batch da BATCH_SIZE
    for (let i = 0; i < destinatari.length; i += BATCH_SIZE) {
      const batch = destinatari.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (contatto) => {
          // Sostituisce variabili nel messaggio
          const messaggioPersonalizzato = campagna.messaggio
            .replace(/\{\{nome\}\}/g, contatto.nome ?? "")
            .replace(/\{\{azienda\}\}/g, "")
            .replace(/\{\{cantiere\}\}/g, "");

          const payload: BrevoSmsPayload = {
            sender: campagna.mittente,
            recipient: contatto.telefono,
            content: messaggioPersonalizzato,
            type: "transactional",
            tag: campagna_id,
          };

          let statoLog = "pending";
          let providerMessageId: string | null = null;
          let providerResponse: Record<string, unknown> | null = null;
          let costoSms: number | null = null;
          let erroreDettaglio: string | null = null;

          try {
            // P2-5: Brevo SMS con timeout 15s (endpoint solitamente veloce).
            const resp = await fetchWithTimeout(BREVO_API_URL, {
              method: "POST",
              headers: {
                "api-key": brevoApiKey,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(payload),
              timeoutMs: 15_000,
            });

            const respJson = await resp.json() as BrevoSmsResponse;
            providerResponse = respJson as unknown as Record<string, unknown>;

            if (resp.ok) {
              statoLog = "inviato";
              providerMessageId = String(respJson.messageId ?? "");
              costoSms = respJson.usedCredits ?? null;
              inviati++;
              costoTotale += costoSms ?? 0;
            } else {
              statoLog = "fallito";
              erroreDettaglio = JSON.stringify(respJson);
              errori++;
            }
          } catch (err) {
            statoLog = "fallito";
            erroreDettaglio = err instanceof Error ? err.message : "Errore sconosciuto";
            errori++;
          }

          // Salva log invio
          await supabase.from("sms_log").insert({
            campagna_id,
            company_id,
            contatto_id: contatto.id,
            telefono: contatto.telefono,
            messaggio: messaggioPersonalizzato,
            stato: statoLog,
            provider_message_id: providerMessageId,
            provider_response: providerResponse,
            costo: costoSms,
            errore_dettaglio: erroreDettaglio,
            inviato_at: statoLog === "inviato" ? new Date().toISOString() : null,
          });
        })
      );

      // Aggiorna contatori dopo ogni batch
      await supabase
        .from("sms_campaigns")
        .update({ inviati, errori, costo_totale: costoTotale })
        .eq("id", campagna_id);

      // Rate limiting: aspetta prima del prossimo batch
      if (i + BATCH_SIZE < destinatari.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Stato finale campagna
    const statoFinale = errori === destinatari.length && destinatari.length > 0
      ? "annullata"
      : "completata";

    await supabase
      .from("sms_campaigns")
      .update({ stato: statoFinale, inviati, errori, costo_totale: costoTotale })
      .eq("id", campagna_id);

    return new Response(
      JSON.stringify({ success: true, inviati, errori }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[invia-sms] Errore generico:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno del server" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
