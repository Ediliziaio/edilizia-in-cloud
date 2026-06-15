import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

/**
 * outreach-reply-send — risposta 2-vie dall'inbox Outreach. Il SUPER_ADMIN
 * risponde a un prospect direttamente dall'app, inviando DALLA stessa casella
 * che l'ha contattato (SMTP reale del pool o EE legacy), con threading
 * best-effort (In-Reply-To/References dal message_id dell'ultima risposta).
 *
 * Flusso:
 *   1. carica il contatto (marketing_contacts) → email obbligatoria
 *   2. risolve la casella mittente: l'ultima che ha spedito a questo contatto
 *      (outreach_send_queue status='sent'), altrimenti una qualunque del pool
 *      (active/warming). Niente caselle → 409.
 *   3. costruisce from/replyTo dal brand (outreach_brands) + casella
 *   4. invia via sendEmailUnified (SMTP override per provider='smtp', altrimenti EE)
 *   5. registra l'invio in outreach_send_queue (storico → appare nel thread)
 *   6. marca 'handled' le risposte del contatto ancora aperte
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
    if (!contactId) return errorResponse("contact_id mancante", 400, corsH);
    if (!body) return errorResponse("Corpo della risposta mancante", 400, corsH);

    // 1. contatto
    const { data: contact, error: cErr } = await admin
      .from("marketing_contacts")
      .select("id,email,first_name,last_name,company_name")
      .eq("id", contactId).maybeSingle();
    if (cErr) throw cErr;
    if (!contact) return errorResponse("Contatto non trovato", 404, corsH);
    const to = String(contact.email || "").trim().toLowerCase();
    if (!to) return errorResponse("Il contatto non ha un'email", 400, corsH);

    // 2. casella che ha contattato il prospect (ultima inviata) → fallback pool
    const { data: lastSent } = await admin
      .from("outreach_send_queue")
      .select("sender_account_id,subject")
      .eq("contact_id", contactId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let senderId = lastSent?.sender_account_id ?? null;
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
      .select("id,email,display_name,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,brand_id,status")
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
    const replyTo = brand?.reply_to || sender.email;

    // 6. oggetto "Re: …"
    const baseSubject = (lastSubject || "").trim();
    const subject = baseSubject
      ? (/^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`)
      : "Re:";

    // 7. threading best-effort: message_id dall'ultima risposta del contatto.
    // Il reply-handler salva raw.message_id (snake_case); proviamo anche messageId.
    const inReplyToHeaders: Record<string, string> = {};
    const { data: lastReply } = await admin
      .from("outreach_replies")
      .select("raw")
      .eq("contact_id", contactId)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const rawObj = (lastReply?.raw ?? {}) as Record<string, unknown>;
    const priorMsgId =
      (typeof rawObj.message_id === "string" && rawObj.message_id) ||
      (typeof rawObj.messageId === "string" && rawObj.messageId) ||
      "";
    if (priorMsgId) {
      inReplyToHeaders["In-Reply-To"] = priorMsgId;
      inReplyToHeaders["References"] = priorMsgId;
    }

    // 8. casella SMTP propria → password dal Vault via RPC; EE legacy → nessun override
    let mailboxOverride:
      | { host: string; port: number; secure: boolean; username: string; password: string }
      | undefined;
    if (sender.provider === "smtp" && sender.secret_ref) {
      const { data: pwd } = await admin.rpc("outreach_mailbox_secret", { p_ref: sender.secret_ref });
      if (pwd && sender.smtp_host && sender.smtp_port) {
        mailboxOverride = {
          host: sender.smtp_host,
          port: sender.smtp_port,
          secure: sender.smtp_secure ?? true,
          username: sender.smtp_username ?? sender.email,
          password: pwd as string,
        };
      }
    }

    const res = await sendEmailUnified({
      companyId: PLATFORM_COMPANY,
      stream: "marketing",
      to,
      subject,
      html: body,
      senderOverride: { from, replyTo, source: "outreach_reply" },
      mailboxOverride,
      headers: Object.keys(inReplyToHeaders).length ? inReplyToHeaders : undefined,
      adminClient: admin,
      metadata: { outreach_reply: true, contact_id: contactId, sender_account_id: sender.id, by: userId },
    });
    if (res && res.ok === false) {
      return errorResponse(
        `Invio non riuscito: ${typeof res.body === "string" ? res.body : JSON.stringify(res.body)}`,
        502,
        corsH,
      );
    }

    const now = new Date();

    // 10. storico nel thread (stessa coda usata dall'inbox per le inviate)
    await admin.from("outreach_send_queue").insert({
      company_id: PLATFORM_COMPANY,
      contact_id: contactId,
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

    // 11. segna gestite le risposte ancora aperte del contatto
    await admin.from("outreach_replies")
      .update({ status: "handled" })
      .eq("contact_id", contactId)
      .in("status", ["unread", "read"]);

    // 12. ok
    return jsonResponse({ ok: true }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-reply-send error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
