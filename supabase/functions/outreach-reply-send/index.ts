import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { isNativeProvider, sendViaNativeSender } from "../_shared/outreachMailboxSend.ts";
import { htmlToPlainText } from "../_shared/outreach-template.ts";

/**
 * outreach-reply-send — risposta 2-vie dall'inbox Outreach. Il SUPER_ADMIN
 * risponde a un prospect direttamente dall'app, inviando DALLA stessa casella
 * che l'ha contattato (SMTP reale del pool o EE legacy), con threading
 * best-effort (In-Reply-To/References dal message_id dell'ultima risposta).
 *
 * Supporta DUE modalità:
 *   A) conversazione con contatto collegato → body: { contact_id, body }
 *   B) conversazione SENZA contatto (email sciolta in inbox) →
 *      body: { to_email, body, sender_account_id? }
 *   In entrambi i casi il threading e la risoluzione casella si basano
 *   sull'indirizzo del prospect (per contact_id si ricava dal contatto).
 *
 * Flusso:
 *   1. risolve il destinatario: dal contatto (marketing_contacts) se c'è
 *      contact_id, altrimenti dall'email passata (to_email) → email obbligatoria
 *   2. risolve la casella mittente: quella esplicita (sender_account_id) se
 *      passata, altrimenti l'ultima che ha spedito a quell'indirizzo
 *      (outreach_send_queue status='sent', per contact_id o per to_email),
 *      altrimenti una qualunque del pool (active/warming). Niente caselle → 409.
 *   3. costruisce from/replyTo dal brand (outreach_brands) + casella
 *   4. invia via sendEmailUnified (SMTP override per provider='smtp', altrimenti EE)
 *   5. registra l'invio in outreach_send_queue (storico → appare nel thread)
 *   6. marca 'handled' le risposte ancora aperte (del contatto o di quell'email)
 *
 * Richiede le tabelle outreach_* (migrazione 20270815000000).
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const payload = await req.json().catch(() => ({}));
    const contactId = String(payload?.contact_id || "").trim();
    const body = String(payload?.body || "").trim();
    // Casella esplicita opzionale (compositore "Nuova email" o risposta sciolta).
    const explicitSenderId = String(payload?.sender_account_id || "").trim();
    if (!body) return errorResponse("Corpo della risposta mancante", 400, corsH);

    // 1. destinatario: dal contatto (se contact_id) oppure dall'email passata.
    //    Per le conversazioni senza contatto collegato il client invia to_email.
    let to = "";
    if (contactId) {
      const { data: contact, error: cErr } = await admin
        .from("marketing_contacts")
        .select("id,email,first_name,last_name,company_name")
        .eq("id", contactId).maybeSingle();
      if (cErr) throw cErr;
      if (!contact) return errorResponse("Contatto non trovato", 404, corsH);
      to = String(contact.email || "").trim().toLowerCase();
      if (!to) return errorResponse("Il contatto non ha un'email", 400, corsH);
    } else {
      to = String(payload?.to_email || "").trim().toLowerCase();
      if (!to) return errorResponse("Destinatario mancante (contact_id o to_email)", 400, corsH);
    }

    // 2. casella mittente: esplicita → ultima che ha spedito a quell'indirizzo
    //    (per contact_id o, in mancanza, per to_email) → fallback pool.
    let lastSentQ = admin
      .from("outreach_send_queue")
      .select("sender_account_id,subject")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1);
    lastSentQ = contactId ? lastSentQ.eq("contact_id", contactId) : lastSentQ.eq("to_email", to);
    const { data: lastSent } = await lastSentQ.maybeSingle();

    let senderId = explicitSenderId || lastSent?.sender_account_id || null;
    const lastSubject = lastSent?.subject ?? null;
    if (!senderId) {
      const { data: anySender } = await admin
        .from("outreach_sender_accounts")
        .select("id")
        .in("status", ["active", "warming"])
        .limit(1)
        .maybeSingle();
      senderId = anySender?.id ?? null;
    }
    if (!senderId) return errorResponse("Nessuna casella disponibile per rispondere", 409, corsH);

    // 4. dati casella + brand
    const { data: sender, error: sErr } = await admin
      .from("outreach_sender_accounts")
      .select("id,email,display_name,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,brand_id,status,oauth_connection_id")
      .eq("id", senderId).maybeSingle();
    if (sErr) throw sErr;
    if (!sender) return errorResponse("Casella mittente non trovata", 404, corsH);

    let brand: { from_name: string | null; reply_to: string | null } | null = null;
    if (sender.brand_id) {
      const { data: b } = await admin
        .from("outreach_brands")
        .select("from_name,reply_to")
        .eq("id", sender.brand_id).maybeSingle();
      brand = b ?? null;
    }

    // 5. from / replyTo
    const fromName = brand?.from_name || sender.display_name;
    const from = fromName ? `${fromName} <${sender.email}>` : sender.email;
    const replyTo = isNativeProvider(sender.provider) ? sender.email : (brand?.reply_to || sender.email);

    // 6. oggetto "Re: …"
    const baseSubject = (lastSubject || "").trim();
    const subject = baseSubject
      ? (/^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`)
      : "Re:";

    // 7. threading best-effort: message_id dall'ultima risposta del prospect
    // (per contact_id se collegato, altrimenti per from_email = indirizzo prospect).
    // Il reply-handler salva raw.message_id (snake_case); proviamo anche messageId.
    const inReplyToHeaders: Record<string, string> = {};
    let lastReplyQ = admin
      .from("outreach_replies")
      .select("raw")
      .order("received_at", { ascending: false })
      .limit(1);
    lastReplyQ = contactId ? lastReplyQ.eq("contact_id", contactId) : lastReplyQ.eq("from_email", to);
    const { data: lastReply } = await lastReplyQ.maybeSingle();
    const rawObj = (lastReply?.raw ?? {}) as Record<string, unknown>;
    const priorMsgId =
      (typeof rawObj.message_id === "string" && rawObj.message_id) ||
      (typeof rawObj.messageId === "string" && rawObj.messageId) ||
      "";
    if (priorMsgId) {
      inReplyToHeaders["In-Reply-To"] = priorMsgId;
      inReplyToHeaders["References"] = priorMsgId;
    }

    // 8. invio: caselle native (gmail/outlook/smtp) dal LORO provider, con il
    // thread della risposta del prospect; Elastic Email legacy via sendEmailUnified.
    let res: { ok: boolean; body?: unknown; providerMessageId?: string | null };
    if (isNativeProvider(sender.provider)) {
      const r = await sendViaNativeSender(admin, sender, {
        companyId: PLATFORM_COMPANY, to, subject, html: body, text: htmlToPlainText(body),
        fromName: brand?.from_name ?? sender.display_name ?? null, replyTo,
        inReplyTo: priorMsgId || null, references: priorMsgId ? [priorMsgId] : [],
        metadata: { outreach_reply: true, contact_id: contactId || null, to_email: to, sender_account_id: sender.id, by: userId },
      });
      res = { ok: r.ok, body: r.error ?? r.body, providerMessageId: r.messageId };
    } else {
      const u = await sendEmailUnified({
        companyId: PLATFORM_COMPANY,
        stream: "marketing",
        to,
        subject,
        html: body,
        // part text/plain (multipart/alternative): meno spam-score della HTML-only.
        text: htmlToPlainText(body),
        senderOverride: { from, replyTo, source: "outreach_reply" },
        headers: Object.keys(inReplyToHeaders).length ? inReplyToHeaders : undefined,
        adminClient: admin,
        metadata: { outreach_reply: true, contact_id: contactId || null, to_email: to, sender_account_id: sender.id, by: userId },
      });
      res = { ok: !(u && u.ok === false), body: u?.body, providerMessageId: u?.providerMessageId ?? null };
    }
    if (!res.ok) {
      return errorResponse(
        `Invio non riuscito: ${typeof res.body === "string" ? res.body : JSON.stringify(res.body)}`,
        502,
        corsH,
      );
    }

    const now = new Date();

    // 10. storico nel thread (stessa coda usata dall'inbox per le inviate).
    // contact_id può essere null (conversazione sciolta): si raggruppa per to_email.
    await admin.from("outreach_send_queue").insert({
      message_id: res.providerMessageId && String(res.providerMessageId).trim().startsWith("<") ? res.providerMessageId : null,
      company_id: PLATFORM_COMPANY,
      contact_id: contactId || null,
      sender_account_id: sender.id,
      channel: "email",
      to_email: to,
      subject,
      body,
      status: "sent",
      sent_at: now.toISOString(),
    });

    // aggiorna il contatore giornaliero della casella (come gli altri invii del pool)
    {
      const today = now.toISOString().slice(0, 10);
      const { data: cur } = await admin
        .from("outreach_sender_accounts")
        .select("daily_sent,daily_sent_date")
        .eq("id", sender.id).maybeSingle();
      const base = cur?.daily_sent_date === today ? (cur?.daily_sent || 0) : 0;
      await admin.from("outreach_sender_accounts")
        .update({ daily_sent: base + 1, daily_sent_date: today, last_sent_at: now.toISOString() })
        .eq("id", sender.id);
    }

    // 11. segna gestite le risposte ancora aperte (del contatto o di quell'email)
    {
      let handledQ = admin.from("outreach_replies")
        .update({ status: "handled" })
        .in("status", ["unread", "read"]);
      handledQ = contactId ? handledQ.eq("contact_id", contactId) : handledQ.eq("from_email", to);
      await handledQ;
    }

    // 12. ok
    return jsonResponse({ ok: true }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-reply-send error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
