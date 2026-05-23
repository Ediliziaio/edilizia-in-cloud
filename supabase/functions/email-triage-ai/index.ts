/**
 * email-triage-ai — GAP 7 (Email Triage AI)
 *
 * Webhook inbound email + AI classification.
 *
 * Endpoint POST con 2 payload shape supportati:
 *   1. INGEST (webhook esterno Resend/Mailgun/Postmark):
 *      {
 *        from: { email, name? },
 *        to: string,            // resolve company via to_email
 *        subject: string,
 *        text: string,
 *        html?: string,
 *        message_id?: string,
 *        attachments?: [...]
 *      }
 *      → salva in email_inbox + triggera AI triage async
 *
 *   2. TRIAGE_PENDING (chiamata interna o cron):
 *      { mode: "triage_pending", company_id?: uuid, limit?: number }
 *      → processa email status='new' applicando AI classification
 *
 * Auth:
 *   - Webhook esterno: header `x-inbound-secret` (env INBOUND_EMAIL_SECRET)
 *   - Cron triage_pending: x-cron-secret (env PROACTIVE_CRON_SECRET)
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface IngestBody {
  from: { email: string; name?: string };
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  message_id?: string;
  attachments?: Array<{ filename: string; mime?: string; url?: string }>;
}

interface TriageBody {
  mode: "triage_pending";
  company_id?: string;
  limit?: number;
}

const SYSTEM_PROMPT_TRIAGE = `Sei l'assistente che triagia le email in ingresso di un'impresa edile italiana.

Per ogni email, classifica e estrai:

categorie:
  - "lead"                  → potenziale cliente nuovo (richiesta preventivo, contatto da form/Google/social)
  - "preventivo"            → richiesta prezzo, offerta, sopralluogo, capitolato o preventivo
  - "cliente_esistente"     → cliente già attivo (conferma, modifica, follow-up)
  - "fornitore"             → ordine, conferma, DDT, comunicazioni dal fornitore
  - "fattura"               → fattura ricevuta (allegato XML/PDF)
  - "pratica_amministrativa" → AdE/Inps/Comune/SCIA/CILA/etc
  - "support"               → richiesta assistenza, problema operativo, ticket
  - "spam"                  → newsletter, promo, no-reply, phishing
  - "altro"                 → tutto il resto

priorità:
  - "alta"   → richiede risposta entro 24h (lead caldo, cliente arrabbiato, scadenza imminente)
  - "media"  → entro 3-5 giorni
  - "bassa"  → entro 1-2 settimane
  - "nessuna" → spam o info

estratti (campo extracted, JSON):
  - nome, cognome, telefono, email
  - indirizzo (se presente, immobile interesse)
  - importo (numerico EUR, se citato)
  - scadenza (data ISO, se citata)
  - keywords (3-5 parole chiave)

suggested_action (string snake_case, una sola):
  - "crea_lead_da_email"
  - "crea_preventivo_da_email"
  - "rispondi_cliente"
  - "carica_fattura_passiva"
  - "gestisci_pratica"
  - "apri_ticket_support"
  - "archivia"
  - "spam_block"

Output JSON ESATTO:
{
  "category": "...",
  "priority": "...",
  "summary": "1 frase max 120 char",
  "extracted": { ... },
  "suggested_action": "..."
}`;

interface TriageResult {
  category: string;
  priority: string;
  summary: string;
  extracted: Record<string, unknown>;
  suggested_action: string;
}

async function resolveCompanyByToEmail(
  supa: SupabaseClient,
  toEmail: string,
): Promise<string | null> {
  // Strategia: cerca companies dove inbound_email_address matcha to_email
  // (campo opzionale che l'azienda configura). Fallback: domain match contro
  // companies.contact_email se semplicemente "info@dominioXYZ.it".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: byInbound } = await (supa as any)
    .from("companies")
    .select("id")
    .eq("inbound_email_address", toEmail.toLowerCase())
    .maybeSingle();
  if (byInbound) return byInbound.id;

  const domain = toEmail.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: byDomain } = await (supa as any)
    .from("companies")
    .select("id")
    .ilike("contact_email", `%@${domain}`)
    .limit(1)
    .maybeSingle();
  return byDomain?.id ?? null;
}

async function triageOneEmail(
  supa: SupabaseClient,
  emailId: string,
  companyId: string,
  subject: string,
  bodyText: string,
  fromEmail: string,
): Promise<TriageResult | null> {
  const truncBody = (bodyText ?? "").substring(0, 4000);
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT_TRIAGE },
    {
      role: "user" as const,
      content: `From: ${fromEmail}\nSubject: ${subject ?? "(no subject)"}\n\nBody:\n${truncBody}`,
    },
  ];

  try {
    const res = await aiRouterComplete({
      supabase: supa,
      companyId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId: "00000000-0000-0000-0000-000000000000" as any, // system context
      taskKey: "email_triage",
      messages,
      maxTokens: 400,
      temperature: 0.1,
      responseFormat: { type: "json_object" },
      idempotencyKey: `email-triage-${emailId}`,
      featureCategory: "doc_analysis",
    });
    const parsed = JSON.parse(res.content ?? "{}");
    return parsed as TriageResult;
  } catch (e) {
    console.error("[email-triage] ai failure:", e);
    return null;
  }
}

async function processIngest(
  supa: SupabaseClient,
  body: IngestBody,
): Promise<Response> {
  const cors = { "Content-Type": "application/json" };

  if (!body.from?.email || !body.to) {
    return new Response(JSON.stringify({ error: "missing_from_or_to" }), {
      status: 400, headers: cors,
    });
  }

  const companyId = await resolveCompanyByToEmail(supa, body.to);
  if (!companyId) {
    return new Response(JSON.stringify({ error: "company_not_resolved", to: body.to }), {
      status: 404, headers: cors,
    });
  }

  // Insert (UNIQUE su message_id evita duplicati)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (supa as any)
    .from("email_inbox")
    .upsert({
      company_id: companyId,
      message_id: body.message_id ?? null,
      from_email: body.from.email,
      from_name: body.from.name ?? null,
      to_email: body.to,
      subject: body.subject?.substring(0, 500) ?? null,
      raw_text: body.text ?? null,
      raw_html: body.html ?? null,
      attachments: body.attachments ?? [],
      status: "new",
      ai_category: "pending",
    }, { onConflict: "company_id,message_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (insErr) {
    return new Response(JSON.stringify({ error: "db_insert_failed", detail: insErr.message }), {
      status: 500, headers: cors,
    });
  }
  if (!inserted) {
    return new Response(JSON.stringify({ status: "duplicate_skipped" }), { headers: cors });
  }

  // Triage immediato (best-effort)
  const result = await triageOneEmail(
    supa, inserted.id, companyId,
    body.subject ?? "", body.text ?? "", body.from.email,
  );

  if (result) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa as any).from("email_inbox").update({
      ai_category: result.category,
      ai_priority: result.priority,
      ai_summary: result.summary?.substring(0, 200),
      ai_extracted: result.extracted ?? {},
      ai_suggested_action: result.suggested_action,
      ai_processed_at: new Date().toISOString(),
      status: "triaged",
    }).eq("id", inserted.id);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa as any).from("email_inbox").update({
      ai_error: "triage failed",
      ai_processed_at: new Date().toISOString(),
    }).eq("id", inserted.id);
  }

  return new Response(JSON.stringify({
    success: true, email_id: inserted.id, triaged: result !== null,
    category: result?.category, priority: result?.priority,
  }), { headers: cors });
}

async function processTriagePending(
  supa: SupabaseClient,
  body: TriageBody,
): Promise<Response> {
  const limit = Math.min(body.limit ?? 10, 50);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supa as any)
    .from("email_inbox")
    .select("id, company_id, subject, raw_text, from_email")
    .eq("status", "new")
    .order("received_at", { ascending: true })
    .limit(limit);
  if (body.company_id) q = q.eq("company_id", body.company_id);

  const { data: pending, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let triaged = 0;
  let failed = 0;
  for (const row of pending ?? []) {
    const result = await triageOneEmail(
      supa, row.id, row.company_id,
      row.subject ?? "", row.raw_text ?? "", row.from_email,
    );
    if (result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa as any).from("email_inbox").update({
        ai_category: result.category,
        ai_priority: result.priority,
        ai_summary: result.summary?.substring(0, 200),
        ai_extracted: result.extracted ?? {},
        ai_suggested_action: result.suggested_action,
        ai_processed_at: new Date().toISOString(),
        status: "triaged",
      }).eq("id", row.id);
      triaged++;
    } else {
      failed++;
    }
  }

  return new Response(JSON.stringify({
    processed: (pending ?? []).length, triaged, failed,
  }), { headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth check
  const inboundSecret = Deno.env.get("INBOUND_EMAIL_SECRET");
  const cronSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const provided = req.headers.get("x-inbound-secret") || req.headers.get("x-cron-secret");
  const valid = provided && (provided === inboundSecret || provided === cronSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  if (body.mode === "triage_pending") {
    return await processTriagePending(supa, body as TriageBody);
  }
  return await processIngest(supa, body as IngestBody);
});
