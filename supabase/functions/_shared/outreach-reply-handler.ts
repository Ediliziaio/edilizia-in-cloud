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
import { intentDaParoleChiave } from "./outreach-intent-parole.ts";
import { avvisaSuperAdmin } from "./avvisaSuperAdmin.ts";
import { testoSenzaCitazione } from "./avvisoEmail.ts";

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
  /** La casella che ha ricevuto la risposta (poll IMAP), per l'avviso al titolare. */
  casella?: string | null;
  /** Il brand a cui ha risposto, deciso da chi legge la posta (outreachRispostaBrand). */
  brandId?: string | null;
  /** La casella che ha ricevuto, per id: resta scritta sulla risposta. */
  senderAccountId?: string | null;
  /** «sì, scritta il 14/09/2026 da info@…» — la verifica dell'invito, già in italiano. */
  invito?: string | null;
}

const INTENTO_IN_CHIARO: Record<string, string> = {
  interested: "interessato",
  question: "fa una domanda",
  not_interested: "non interessato",
  unsubscribe: "chiede di non essere più contattato",
  referral: "indica un'altra persona",
  other: "altro",
};

/**
 * Avviso al titolare per ogni risposta vera (16/09/2026): chi ha risposto, da
 * quale brand e flusso, a quale casella, e cosa ha scritto. Arriva su
 * campanella, push e Gmail (vedi avvisaSuperAdmin). Mai bloccante.
 */
async function avvisaRisposta(admin: any, r: InboundReply, fromEmail: string, intent: string | null): Promise<void> {
  try {
    let nome = "";
    let azienda = "";
    let telefono = "";
    if (r.contactId) {
      const { data: c } = await admin.from("marketing_contacts")
        .select("first_name,last_name,company_name,phone").eq("id", r.contactId).maybeSingle();
      nome = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
      azienda = c?.company_name ?? "";
      telefono = c?.phone ?? "";
    }
    let brand = "";
    let flusso = "";
    // Il brand lo decide chi ha letto la posta (la casella che ha ricevuto);
    // dalla sequenza si prende solo il nome del flusso, e il brand come ripiego.
    let brandId = r.brandId ?? null;
    if (r.enrollmentId) {
      const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", r.enrollmentId).maybeSingle();
      if (e?.sequence_id) {
        const { data: s } = await admin.from("outreach_sequences").select("name,brand_id").eq("id", e.sequence_id).maybeSingle();
        flusso = s?.name ?? "";
        if (!brandId) brandId = s?.brand_id ?? null;
      }
    }
    if (brandId) {
      const { data: b } = await admin.from("outreach_brands").select("name").eq("id", brandId).maybeSingle();
      brand = b?.name ?? "";
    }
    const chi = azienda || nome || fromEmail;
    await avvisaSuperAdmin(admin, {
      tipo: "outreach_risposta_email",
      // Il brand nell'oggetto: tre servizi diversi, e la prima cosa da sapere
      // aprendo la mail è per chi ha risposto questa persona.
      titolo: brand ? `${brand} · Risposta email da ${chi}` : `Risposta email da ${chi}`,
      testo: snippetFrom(r.text, 160) ?? "(risposta senza testo)",
      url: "/admin/marketing?tab=posta",
      tag: `outreach-risposta-${r.messageId ?? fromEmail}`,
      entityType: r.contactId ? "marketing_contact" : undefined,
      entityId: r.contactId,
      email: {
        testo: testoSenzaCitazione(r.text) || "(risposta senza testo)",
        righe: [
          { etichetta: "Da", valore: [nome, fromEmail].filter(Boolean).join(" · ") },
          { etichetta: "Azienda", valore: azienda },
          { etichetta: "Telefono", valore: telefono },
          { etichetta: "Brand", valore: brand },
          { etichetta: "Flusso", valore: flusso },
          { etichetta: "Casella", valore: r.casella ?? "" },
          { etichetta: "Invito verificato", valore: r.invito ?? "" },
          { etichetta: "Oggetto", valore: r.subject ?? "" },
          { etichetta: "Intento", valore: intent ? (INTENTO_IN_CHIARO[intent] ?? intent) : "da classificare" },
        ],
      },
    });
  } catch (e) {
    console.warn("[outreach-reply-handler] avviso risposta non inviato:", e instanceof Error ? e.message : e);
  }
}

/**
 * Gestisce una risposta in arrivo: inbox + intent + stop sequenza + opt-out.
 * Idempotenza: NON deduplica per messageId (l'inbound non lo faceva); i
 * chiamanti che leggono via IMAP devono evitare di rileggere gli stessi UID.
 */
export async function handleInboundReply(admin: any, r: InboundReply): Promise<void> {
  const nowIso = new Date().toISOString();
  // Dedup per Message-ID: il poll IMAP rileggeva le stesse risposte ogni 15
  // minuti (righe doppie in Posta + una chiamata AI a giro).
  if (r.messageId) {
    const { data: dup } = await admin.from("outreach_replies").select("id")
      .eq("company_id", PLATFORM_COMPANY).eq("message_id", r.messageId).limit(1).maybeSingle();
    if (dup?.id) return;
  }
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
  const riga: Record<string, unknown> = {
    company_id: PLATFORM_COMPANY,
    contact_id: r.contactId,
    enrollment_id: r.enrollmentId ?? null,
    brand_id: r.brandId ?? null,
    sender_account_id: r.senderAccountId ?? null,
    channel: "email",
    from_email: fromEmail,
    subject: r.subject ?? null,
    snippet,
    status: "unread",
    intent: autoReply ? "auto_reply" : null,
    intent_confidence: autoReply ? 1 : null,
    received_at: nowIso,
    message_id: r.messageId ?? null,
    raw: {
      from: fromEmail,
      subject: r.subject ?? null,
      message_id: r.messageId ?? null,
      text: r.text ?? null,
      auto_reply: autoReply,
    },
  };
  let { data: inserted, error: insErr } = await admin.from("outreach_replies").insert(riga).select("id").single();
  if (insErr && /brand_id|sender_account_id/.test(String(insErr.message ?? ""))) {
    // Funzione deployata prima della migrazione: la risposta si salva lo stesso.
    delete riga.brand_id;
    delete riga.sender_account_id;
    ({ data: inserted, error: insErr } = await admin.from("outreach_replies").insert(riga).select("id").single());
  }
  if (insErr) throw insErr;

  // Autorisposta: ci fermiamo qui. La sequenza prosegue (nessuno stop), nessuna
  // classificazione AI, nessun opt-out. Idempotente: rieseguire reinserisce solo
  // un'altra riga 'auto_reply' senza toccare iscrizioni/contatto.
  if (autoReply) return;

  // 2. Classifica l'intento con l'AI (best-effort, non blocca)
  let intent: string | null = null;
  if (inserted?.id) intent = await classifyAndStoreIntent(admin, inserted.id, r.subject ?? "", snippet ?? "");
  // Fallback a parole chiave: senza List-Unsubscribe l'unica via d'uscita è
  // rispondere «no», e deve funzionare anche se l'AI è giù o non è sicura.
  // «Cancellatemi» vince sempre; «non mi interessa» solo se l'AI non ha deciso.
  const daParole = intentDaParoleChiave(r.subject ?? "", r.text ?? "");
  if (daParole === "unsubscribe" || (daParole && (intent === null || intent === "other"))) {
    intent = daParole;
    if (inserted?.id) {
      await admin.from("outreach_replies").update({ intent, intent_confidence: 0.6 }).eq("id", inserted.id);
    }
  }

  // 2-bis. Avviso al titolare: chi ha risposto e cosa, anche su Gmail.
  await avvisaRisposta(admin, r, fromEmail, intent);

  // 3. AUTO-PAUSA SU RISPOSTA: chi risponde non deve più ricevere follow-up cold.
  // Fermiamo TUTTE le iscrizioni ancora vive del contatto (non solo quella passata
  // dal chiamante: un lead può essere in più sequenze) → 'replied' + annulliamo i
  // messaggi ancora 'queued'. Idempotente (filtri su status) e coerente con lo
  // skip del dispatcher (TERMINAL_ENROLLMENT include 'replied'). Se manca il
  // contatto ricadiamo sull'enrollmentId passato, se presente.
  await stopActiveSequences(admin, r.contactId, r.enrollmentId);

  // 4-bis. TRIGGER: una risposta interessata o una domanda diventa un task di
  // chiamata entro domani (pending in outreach_call_tasks, visibile in "Oggi"):
  // il valore di un cold sta tutto nei minuti dopo la risposta.
  if ((intent === "interested" || intent === "question") && r.contactId) {
    try {
      const { data: c } = await admin.from("marketing_contacts")
        .select("first_name,last_name,company_name,phone").eq("id", r.contactId).maybeSingle();
      let sequenceId: string | null = null;
      if (r.enrollmentId) {
        const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", r.enrollmentId).maybeSingle();
        sequenceId = e?.sequence_id ?? null;
      }
      const { data: giaAperto } = await admin.from("outreach_call_tasks").select("id")
        .eq("company_id", PLATFORM_COMPANY).eq("contact_id", r.contactId).eq("status", "pending").limit(1).maybeSingle();
      if (!giaAperto?.id) {
        await admin.from("outreach_call_tasks").insert({
          company_id: PLATFORM_COMPANY,
          enrollment_id: r.enrollmentId ?? null,
          contact_id: r.contactId,
          sequence_id: sequenceId,
          phone: c?.phone ?? null,
          contact_name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
          company_name: c?.company_name ?? null,
          note: `${intent === "interested" ? "Ha risposto INTERESSATO" : "Ha fatto una DOMANDA"} via email (${fromEmail}): "${(snippet ?? "").slice(0, 240)}"`,
          status: "pending",
          due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        });
      }
    } catch (e) {
      console.warn("[outreach-reply-handler] task chiamata non creato:", e instanceof Error ? e.message : e);
    }
  }

  // 4-ter. "Non interessato": cooldown di 6 mesi. Prima restava contattabile
  // e la campagna successiva lo riprendeva dopo 90 giorni.
  if (intent === "not_interested" && r.contactId) {
    try {
      await admin.from("marketing_contacts")
        .update({ ricontatta_dopo: new Date(Date.now() + 183 * 86_400_000).toISOString() }).eq("id", r.contactId);
    } catch { /* colonna assente pre-migrazione */ }
  }

  // 4-quater. Il lock multi-brand sull'azienda si chiude con l'esito: opt-out
  // = 10 anni e soppressione dell'azienda, no = 24 mesi, sì = 12 mesi. Prima
  // outreach_release_brand_lock non la chiamava nessuno: i cooldown per
  // azienda restavano sulla carta.
  if (intent === "unsubscribe") await rilasciaLock(admin, r.contactId, r.enrollmentId, "opt_out");
  else if (intent === "not_interested") await rilasciaLock(admin, r.contactId, r.enrollmentId, "risposta_negativa");
  else if (intent === "interested") await rilasciaLock(admin, r.contactId, r.enrollmentId, "risposta_positiva");

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

/** Chiude il lock dell'azienda del contatto con l'esito della risposta (best effort). */
export async function rilasciaLock(
  admin: any, contactId: string | null, enrollmentId: string | null | undefined,
  esito: "opt_out" | "risposta_negativa" | "risposta_positiva" | "bounce",
): Promise<void> {
  if (!contactId) return;
  try {
    const { data: pc } = await admin.from("outreach_prospect_contacts")
      .select("prospect_company_id").eq("contact_id", contactId).maybeSingle();
    if (!pc?.prospect_company_id) return;
    let brandId: string | null = null;
    if (enrollmentId) {
      const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", enrollmentId).maybeSingle();
      if (e?.sequence_id) {
        const { data: sq } = await admin.from("outreach_sequences").select("brand_id").eq("id", e.sequence_id).maybeSingle();
        brandId = sq?.brand_id ?? null;
      }
    }
    await admin.rpc("outreach_release_brand_lock", {
      p_prospect_company_id: pc.prospect_company_id, p_brand_id: brandId, p_esito: esito,
    });
  } catch (e) {
    console.warn("[outreach-reply-handler] rilascio lock:", e instanceof Error ? e.message : e);
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
