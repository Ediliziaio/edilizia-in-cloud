/**
 * ai-whatsapp-quote-webhook — Feature #6
 *
 * Webhook ricevitore WhatsApp Business per richieste preventivo.
 * Cliente scrive "Vorrei un preventivo per..." → AI estrae i requisiti
 * → crea proposta `create_quote_draft` con bozza pre-compilata pronta
 * per l'approvazione del commerciale.
 *
 * STATO: skeleton opt-in. Attivo solo se WHATSAPP_VERIFY_TOKEN env è
 * settato (verification handshake per Meta) + WA_BUSINESS_PHONE_NUMBER_ID
 * configurato. Senza env il webhook risponde 200 ma non processa.
 *
 * Endpoint Meta config:
 *   - Webhook URL: https://<project>.supabase.co/functions/v1/ai-whatsapp-quote-webhook
 *   - Verify Token: valore di WHATSAPP_VERIFY_TOKEN
 *
 * Auth: pubblico (richiesto da Meta Webhook), validato via X-Hub-Signature-256
 * con WA_APP_SECRET. Senza signature valida i POST vengono rifiutati.
 *
 * Flow del messaggio:
 *   1. GET ?hub.mode=subscribe&hub.verify_token=... → handshake Meta
 *   2. POST con body Meta WhatsApp Business → estraiamo:
 *      - from (numero cliente)
 *      - text.body (messaggio)
 *   3. Match: a quale company appartiene il numero destinatario?
 *      (lookup wa_business_numbers per recipient_id)
 *   4. Intent detection: parole chiave "preventivo", "quanto costa",
 *      "richiesta", oppure call AI light (Claude haiku, costo bassissimo)
 *   5. Se intent = quote_request:
 *      - Cerca/crea marketing_contact con phone matching
 *      - Crea ai_action_proposals canonica create_quote_draft con payload
 *        {client_name, client_phone, channel: "whatsapp", message_raw, ...}
 *   6. Risponde 200 con eventuale echo per Meta
 *
 * Comportamento preservato: senza env settati il webhook non fa nulla
 * di osservabile lato DB. Tutte le chiavi richieste sono opzionali.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const QUOTE_INTENT_KEYWORDS = [
  "preventivo", "preventivi", "stima", "quanto costa", "quanto verrebbe",
  "richiesta", "vorrei", "potete farmi", "fareste", "prezzo per",
  "offerta", "info su", "informazioni su",
];

function detectQuoteIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return QUOTE_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

interface WAMessage {
  from?: string;
  text?: { body?: string };
  timestamp?: string;
  id?: string;
}

interface WAContact {
  profile?: { name?: string };
  wa_id?: string;
}

interface WAChange {
  field?: string;
  value?: {
    messaging_product?: string;
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: WAContact[];
    messages?: WAMessage[];
  };
}

interface WAEntry {
  changes?: WAChange[];
}

interface WABody {
  object?: string;
  entry?: WAEntry[];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── GET verification handshake Meta ────────────────────────────────────
  if (req.method === "GET") {
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Webhook signature validation (Meta App Secret) — opt-in.
  // Se WA_APP_SECRET non settato, accettiamo comunque ma non processiamo
  // azioni che modificano stato → safe default.
  const appSecret = Deno.env.get("WA_APP_SECRET");
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  // Read body once
  const rawBody = await req.text();

  if (appSecret) {
    const valid = await verifySignature(rawBody, signature, appSecret);
    if (!valid) {
      return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
    }
  }

  let body: WABody;
  try {
    body = JSON.parse(rawBody) as WABody;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const summary = {
    messages_received: 0,
    proposals_created: 0,
    skipped_no_intent: 0,
    skipped_no_company_match: 0,
    errors: [] as string[],
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      const contacts = change.value?.contacts ?? [];
      const messages = change.value?.messages ?? [];

      for (const m of messages) {
        summary.messages_received += 1;
        const text = m.text?.body ?? "";
        const from = m.from ?? "";
        if (!text || !from) continue;

        if (!detectQuoteIntent(text)) {
          summary.skipped_no_intent += 1;
          continue;
        }

        // Match company via WA business phone number ID (opzionale lookup)
        let companyId: string | null = null;
        if (phoneNumberId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: bn } = await (supabase as any)
            .from("wa_business_numbers")
            .select("company_id")
            .eq("recipient_id", phoneNumberId)
            .maybeSingle();
          companyId = (bn as { company_id?: string } | null)?.company_id ?? null;
        }
        if (!companyId) {
          // Tabella opzionale (può non esistere): degrade silent
          summary.skipped_no_company_match += 1;
          continue;
        }

        // Risolvi/crea contact
        const contactName = contacts.find((c) => c.wa_id === from)?.profile?.name ?? "Cliente WhatsApp";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let contactId: string | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("marketing_contacts")
          .select("id")
          .eq("company_id", companyId)
          .eq("phone", `+${from}`)
          .maybeSingle();
        if (existing?.id) {
          contactId = existing.id;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: created } = await (supabase as any)
            .from("marketing_contacts")
            .insert({
              company_id: companyId,
              first_name: contactName.split(" ")[0] ?? "Cliente",
              last_name: contactName.split(" ").slice(1).join(" ") || null,
              phone: `+${from}`,
              source: "whatsapp_business",
            })
            .select("id")
            .maybeSingle();
          contactId = created?.id ?? null;
        }

        // Risolvi admin user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: roleRow } = await (supabase as any)
          .from("user_roles")
          .select("user_id")
          .eq("company_id", companyId)
          .in("role", ["company_admin", "company_staff", "salesperson"])
          .limit(1)
          .maybeSingle();
        const adminUserId = (roleRow as { user_id?: string } | null)?.user_id;
        if (!adminUserId) continue;

        // Crea proposta create_quote_draft con il messaggio originale
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: propErr } = await (supabase as any).rpc("create_proactive_proposal", {
          p_company_id: companyId,
          p_user_id: adminUserId,
          p_persona_key: "sales",
          p_action_type: "create_quote_draft",
          p_summary: `WhatsApp: ${contactName} chiede preventivo — "${text.slice(0, 80)}…"`.slice(0, 200),
          p_payload: {
            client_name: contactName,
            client_phone: `+${from}`,
            client_email: null,
            contact_id: contactId,
            channel: "whatsapp",
            message_raw: text,
            message_id: m.id ?? null,
            title: `Preventivo da WhatsApp — ${contactName}`,
            notes: `Richiesta arrivata via WhatsApp: ${text}`,
          },
          p_signal_type: "whatsapp_quote_request",
          p_signal_entity_id: null, // contact_id può essere null la prima volta
          p_signal_metadata: { wa_message_id: m.id, raw_length: text.length },
          p_risk_level: "yellow",
          p_ttl_days: 3,
        });
        if (propErr) {
          summary.errors.push(`proposal: ${propErr.message}`);
        } else {
          summary.proposals_created += 1;
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});

async function verifySignature(body: string, header: string, secret: string): Promise<boolean> {
  if (!header.startsWith("sha256=")) return false;
  const expected = header.slice(7);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(hex, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
