/**
 * outreach-reply-handler — logica condivisa "gestisci risposta" del cold outreach.
 *
 * Ricevuta una risposta di un prospect (dal webhook inbound SES/SNS/Mailgun
 * OPPURE dal poller IMAP delle caselle del pool), fa, in ordine:
 *   1. scrive la risposta in outreach_replies (snippet ripulito);
 *   2. classifica l'intento con l'AI (best-effort: non blocca su errore);
 *   3. su risposta STOPpa la sequenza (enrollment → 'replied') e annulla i
 *      messaggi ancora 'queued' di quell'iscrizione;
 *   4. se l'intento è 'unsubscribe', opt-out del contatto + blocklist.
 *
 * Estratta da outreach-inbound/index.ts perché il percorso "lettura risposte via
 * IMAP" (outreach-imap-poll) riusa identica questa logica. Richiede un client
 * Supabase admin (service-role). Tutto best-effort sulla classificazione AI.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterComplete } from "./aiRouter.ts";
import {
  normalizeIntent,
  normalizeConfidence,
  INTENT_SYSTEM_PROMPT,
  buildIntentUserPrompt,
} from "./outreach-intent.ts";
import { snippetFrom } from "./outreach-inbound-logic.ts";

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

export interface InboundReply {
  contactId: string | null;
  enrollmentId?: string | null;
  from: string;
  subject: string;
  text: string;
  messageId?: string | null;
}

/**
 * Gestisce una risposta in arrivo: inbox + intent + stop sequenza + opt-out.
 * Idempotenza: NON deduplica per messageId (l'inbound non lo faceva); i
 * chiamanti che leggono via IMAP devono evitare di rileggere gli stessi UID.
 */
export async function handleInboundReply(admin: any, r: InboundReply): Promise<void> {
  const nowIso = new Date().toISOString();
  const fromEmail = (r.from || "").trim();
  const snippet = snippetFrom(r.text);

  // 1. Scrivi la risposta nell'inbox
  const { data: inserted, error: insErr } = await admin.from("outreach_replies").insert({
    company_id: PLATFORM_COMPANY,
    contact_id: r.contactId,
    enrollment_id: r.enrollmentId ?? null,
    channel: "email",
    from_email: fromEmail,
    subject: r.subject ?? null,
    snippet,
    status: "unread",
    received_at: nowIso,
    raw: { from: fromEmail, subject: r.subject ?? null, message_id: r.messageId ?? null, text: r.text ?? null },
  }).select("id").single();
  if (insErr) throw insErr;

  // 2. Classifica l'intento con l'AI (best-effort, non blocca)
  let intent: string | null = null;
  if (inserted?.id) intent = await classifyAndStoreIntent(admin, inserted.id, r.subject ?? "", snippet ?? "");

  // 3. STOP su risposta: ferma la sequenza e annulla i messaggi ancora in coda.
  if (r.enrollmentId) {
    await admin.from("outreach_enrollments")
      .update({ status: "replied", stop_reason: "Risposta del destinatario" }).eq("id", r.enrollmentId);
    await admin.from("outreach_send_queue")
      .update({ status: "cancelled" }).eq("enrollment_id", r.enrollmentId).eq("status", "queued");
  }

  // 4. Se l'AI ha capito "unsubscribe", opt-out del contatto e blocklist.
  if (intent === "unsubscribe") {
    if (r.contactId) {
      await admin.from("marketing_contacts")
        .update({ optout_email: true, optout_at: nowIso, optout_reason: "unsubscribe" }).eq("id", r.contactId);
    }
    if (fromEmail) {
      await admin.from("email_suppressions").upsert(
        { company_id: PLATFORM_COMPANY, email: fromEmail, reason: "unsubscribe", notes: "Richiesta nella risposta (AI)" },
        { onConflict: "company_id,email_normalized,reason" },
      );
    }
  }
}

/**
 * Classifica l'intento di una risposta con l'AI (Unibox NLP) e lo salva sulla
 * riga outreach_replies. Best-effort: ogni errore (AI giù, colonna assente
 * prima della migrazione) viene loggato ma non blocca l'ingestione.
 */
async function classifyAndStoreIntent(admin: any, replyId: string, subject: string, snippet: string): Promise<string | null> {
  try {
    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "outreach_reply_intent",
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: buildIntentUserPrompt(subject, snippet) },
      ],
      params: { temperature: 0, max_tokens: 60 },
      responseFormat: { type: "json_object" },
      companyId: PLATFORM_COMPANY,
      userId: null,
      skipCharge: true,
    });
    let intent = "other";
    let confidence = 0;
    try {
      const o = JSON.parse(result.content || "{}");
      intent = normalizeIntent(o.intent);
      confidence = normalizeConfidence(o.confidence);
    } catch { /* default other */ }
    await admin.from("outreach_replies").update({ intent, intent_confidence: confidence }).eq("id", replyId);
    return intent;
  } catch (e) {
    console.warn("[outreach-reply-handler] intent classify skip:", e instanceof Error ? e.message : e);
    return null;
  }
}
