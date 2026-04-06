/**
 * telnyx-send-sms
 * Invia un singolo SMS transazionale via Telnyx (non campagna).
 * Verifica crediti wallet → chiama Telnyx API → logga in sms_messages.
 * POST autenticato JWT: { to_number, body, company_id, trigger_type?, trigger_entity?, trigger_ref? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

interface RequestBody {
  to_number: string;
  body: string;
  company_id: string;
  trigger_type?: string;
  trigger_entity?: string;
  trigger_ref?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const masterApiKey   = Deno.env.get("TELNYX_MASTER_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticazione richiesta" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json() as RequestBody;
    const { to_number, body: msgBody, company_id, trigger_type, trigger_entity, trigger_ref } = body;

    if (!to_number || !msgBody || !company_id) {
      return json({ error: "Parametri obbligatori: to_number, body, company_id" }, 400);
    }

    // ── Leggi numero mittente attivo ─────────────────────────────
    const { data: numero, error: errNumero } = await admin
      .from("sms_telnyx_numbers")
      .select("numero_e164, telnyx_phone_number_id, messaging_profile_id")
      .eq("company_id", company_id)
      .eq("stato", "attivo")
      .maybeSingle();

    if (errNumero || !numero) {
      return json({
        ok: false,
        error: "Nessun numero SMS attivo. Attiva prima un numero nel modulo SMS Marketing.",
      }, 400);
    }

    // ── Leggi account Telnyx sub-account ─────────────────────────
    const { data: account } = await admin
      .from("sms_telnyx_accounts")
      .select("telnyx_api_key, stato")
      .eq("company_id", company_id)
      .maybeSingle();

    const apiKey = account?.telnyx_api_key ?? masterApiKey;
    if (!apiKey) {
      return json({ ok: false, error: "Chiave API Telnyx non configurata" }, 500);
    }

    // ── Verifica crediti wallet ───────────────────────────────────
    const { data: pricing } = await admin
      .from("sms_pricing_config")
      .select("prezzo_per_sms")
      .limit(1)
      .maybeSingle();
    const costoSms = Number(pricing?.prezzo_per_sms ?? 0.06);

    const { data: wallet } = await admin
      .from("sms_wallet")
      .select("crediti_disponibili, saldo_bloccato")
      .eq("company_id", company_id)
      .maybeSingle();

    const crediti = Number(wallet?.crediti_disponibili ?? 0);
    const bloccato = wallet?.saldo_bloccato ?? false;

    if (bloccato || crediti < costoSms) {
      return json({
        ok: false,
        error: "Crediti SMS insufficienti. Ricarica il wallet per continuare.",
      }, 402);
    }

    // ── Crea record sms_messages (stato: queued) ─────────────────
    const { data: msgRecord, error: errInsert } = await admin
      .from("sms_messages")
      .insert({
        company_id,
        direction: "outbound",
        status: "queued",
        to_number,
        from_number: numero.numero_e164,
        body: msgBody,
        trigger_type: trigger_type ?? "manual",
        trigger_entity: trigger_entity ?? null,
        trigger_ref: trigger_ref ?? null,
      })
      .select("id")
      .single();

    if (errInsert || !msgRecord) {
      console.error("telnyx-send-sms: errore insert sms_messages", errInsert);
      return json({ ok: false, error: "Errore salvataggio messaggio" }, 500);
    }

    const msgId = msgRecord.id as string;

    // ── Chiama Telnyx API ─────────────────────────────────────────
    const telnyxBody: Record<string, unknown> = {
      from: numero.numero_e164,
      to: to_number,
      text: msgBody,
      type: "SMS",
    };
    if (numero.messaging_profile_id) {
      telnyxBody.messaging_profile_id = numero.messaging_profile_id;
    }

    const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(telnyxBody),
    });

    if (!telnyxRes.ok) {
      const errText = await telnyxRes.text();
      console.error("telnyx-send-sms: errore Telnyx API", telnyxRes.status, errText);

      await admin
        .from("sms_messages")
        .update({
          status: "failed",
          error_message: `Telnyx ${telnyxRes.status}: ${errText.slice(0, 500)}`,
        })
        .eq("id", msgId);

      return json({ ok: false, error: "Errore invio SMS tramite Telnyx" }, 502);
    }

    const telnyxData = await telnyxRes.json() as { data?: { id?: string } };
    const telnyxId   = telnyxData?.data?.id ?? null;

    // ── Aggiorna record con telnyx_id e stato ────────────────────
    await admin
      .from("sms_messages")
      .update({
        status: "sending",
        telnyx_id: telnyxId,
        sent_at: new Date().toISOString(),
      })
      .eq("id", msgId);

    // ── Scala crediti wallet ──────────────────────────────────────
    await admin
      .from("sms_wallet_transazioni")
      .insert({
        company_id,
        tipo: "addebito_sms",
        importo: costoSms,
        note: `SMS transazionale #${msgId.slice(0, 8)} → ${to_number}`,
      });

    return json({ ok: true, message_id: msgId, telnyx_id: telnyxId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("telnyx-send-sms: errore non gestito", message);
    return json({ ok: false, error: message }, 500);
  }
});
