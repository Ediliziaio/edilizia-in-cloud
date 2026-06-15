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
import { isAutoReply, type InboundHeaders } from "./outreach-autoreply.ts";

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

export interface InboundReply {
  contactId: string | null;
  enrollmentId?: string | null;
  from: string;
  subject: string;
  text: string;
  messageId?: string | null;
  /** Header RFC normalizzati (lowercase→valore), se il provider/IMAP li espone. */
  headers?: InboundHeaders;
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

  // AUTORISPOSTA (OOO / mailer-daemon / no-reply)? Va trattata a parte: salviamo
  // comunque la riga (resta visibile in Posta), ma NON fermiamo la sequenza e NON
  // la classifichiamo come "interessato". Header (se presenti) + euristiche su
  // oggetto/corpo. Vedi outreach-autoreply.ts.
  const autoReply = isAutoReply({
    headers: r.headers,
    subject: r.subject,
    body: r.text,
    from: fromEmail,
  });

  // 1. Scrivi la risposta nell'inbox. Per le autorisposte fissiamo subito
  // intent='auto_reply' sulla riga (niente classificazione AII a seguire).
  const { data: inserted, error: insErr } = await admin.from("outreach_replies").insert({
    company_id: PLATFORM_COMPANY,
    contact_id: r.contactId,
    enrollment_id: r.enrollmentId ?? null,
    channel: "email",
    from_email: fromEmail,
    subject: r.subject ?? null,
    snippet,
    status: "unread",
    intent: autoReply ? "auto_reply" : null,
    intent_confidence: autoReply ? 1 : null,
    received_at: nowIso,
    raw: {
      from: fromEmail,
      subject: r.subject ?? null,
      message_id: r.messageId ?? null,
      text: r.text ?? null,
      auto_reply: autoReply,
    },
  }).select("id").single();
  if (insErr) throw insErr;

  // Autorisposta: ci fermiamo qui. La sequenza prosegue (nessuno stop), nessuna
  // classificazione AI, nessun opt-out. Idempotente: rieseguire reinserisce solo
  // un'altra riga 'auto_reply' senza toccare iscrizioni/contatto.
  if (autoReply) return;

  // 2. Classifica l'intento con l'AI (best-effort, non blocca)
  let intent: string | null = null;
  if (inserted?.id) intent = await classifyAndStoreIntent(admin, inserted.id, r.subject ?? "", snippet ?? "");

  // 3. AUTO-PAUSA SU RISPOSTA: chi risponde non deve più ricevere follow-up cold.
  // Fermiamo TUTTE le iscrizioni ancora vive del contatto (non solo quella passata
  // dal chiamante: un lead può essere in più sequenze) → 'replied' + annulliamo i
  // messaggi ancora 'queued'. Idempotente (filtri su status) e coerente con lo
  // skip del dispatcher (TERMINAL_ENROLLMENT include 'replied'). Se manca il
  // contatto ricadiamo sull'enrollmentId passato, se presente.
  await stopActiveSequences(admin, r.contactId, r.enrollmentId);

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
 * Ferma le sequenze cold ancora attive del contatto dopo una sua risposta.
 * Stati vivi = 'active' | 'paused' (gli altri sono già terminali). Le porta a
 * 'replied' e annulla i messaggi ancora 'queued'. Se non c'è il contatto ma c'è
 * un enrollmentId esplicito, ferma almeno quello. Idempotente.
 */
async function stopActiveSequences(admin: any, contactId: string | null, enrollmentId?: string | null): Promise<void> {
  let ids: string[] = [];
  if (contactId) {
    const { data: enrs } = await admin
      .from("outreach_enrollments")
      .select("id")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("contact_id", contactId)
      .in("status", ["active", "paused"]);
    ids = ((enrs ?? []) as Array<{ id: string }>).map((e) => e.id);
  }
  // Fallback: nessun contatto collegato ma il chiamante ha trovato un enrollment.
  if (ids.length === 0 && enrollmentId) ids = [enrollmentId];
  if (ids.length === 0) return;

  await admin.from("outreach_enrollments")
    .update({ status: "replied", next_action_at: null, stop_reason: "Risposta del destinatario" })
    .in("id", ids);
  await admin.from("outreach_send_queue")
    .update({ status: "cancelled", last_error: "reply received" })
    .in("enrollment_id", ids)
    .eq("status", "queued");
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
