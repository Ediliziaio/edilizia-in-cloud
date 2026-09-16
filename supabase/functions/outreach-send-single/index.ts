import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { isNativeProvider, sendViaNativeSender } from "../_shared/outreachMailboxSend.ts";
import { htmlToPlainText, renderTemplate, contactToVars, hashSeed } from "../_shared/outreach-template.ts";

/**
 * outreach-send-single — il SUPER_ADMIN invia UNA email al volo da una casella
 * del pool cold (oltre alle sequenze). Usa sendEmailUnified (stream marketing +
 * senderOverride = casella scelta), aggiorna il contatore giornaliero della
 * casella e registra l'invio in outreach_send_queue (storico). Richiede le
 * tabelle outreach_* (migrazione 20270815000000).
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const senderId = String(body?.sender_account_id || "");
    const to = String(body?.to || "").trim().toLowerCase();
    const subject = String(body?.subject || "");
    const html = String(body?.html || "");
    const contactId = body?.contact_id ? String(body.contact_id) : null;
    if (!senderId || !to || !html) return errorResponse("Campi mancanti (casella, destinatario, corpo)", 400, corsH);

    const { data: sender, error: sErr } = await admin
      .from("outreach_sender_accounts")
      .select("id,email,display_name,status,daily_sent,daily_sent_date,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,oauth_connection_id")
      .eq("id", senderId).maybeSingle();
    if (sErr) throw sErr;
    if (!sender) return errorResponse("Casella mittente non trovata", 404, corsH);
    if (sender.status === "disabled" || sender.status === "paused") {
      return errorResponse("La casella è in pausa o disabilitata", 409, corsH);
    }

    // Personalizzazione: se è collegato un contatto, sostituiamo {{first_name}} &
    // co. PRIMA dell'invio. Senza questo, i chip variabile del compositore
    // arrivavano LETTERALI al prospect ("Ciao {{first_name}}").
    let vars: ReturnType<typeof contactToVars> = {};
    if (contactId) {
      const { data: contact } = await admin
        .from("marketing_contacts")
        .select("first_name,last_name,company_name,email,phone,province,region,website")
        .eq("id", contactId).maybeSingle();
      if (contact) vars = contactToVars(contact);
    }
    const seed = hashSeed(to);
    const renderedSubject = renderTemplate(subject, vars, { seed });
    const renderedHtml = renderTemplate(html, vars, { seed });

    // Invio: caselle native (gmail/outlook/smtp) dal LORO provider; Elastic
    // Email legacy via sendEmailUnified.
    const from = sender.display_name ? `${sender.display_name} <${sender.email}>` : sender.email;
    let res: { ok: boolean; body?: unknown; providerMessageId?: string | null };
    if (isNativeProvider(sender.provider)) {
      const r = await sendViaNativeSender(admin, sender, {
        companyId: PLATFORM_COMPANY, to, subject: renderedSubject, html: renderedHtml, text: htmlToPlainText(renderedHtml),
        fromName: sender.display_name ?? null, replyTo: sender.email,
        metadata: { outreach_single: true, sender_account_id: sender.id, by: userId },
      });
      res = { ok: r.ok, body: r.error ?? r.body, providerMessageId: r.messageId };
    } else {
      const u = await sendEmailUnified({
        companyId: PLATFORM_COMPANY,
        stream: "marketing",
        to,
        subject: renderedSubject,
        html: renderedHtml,
        // part text/plain (multipart/alternative): meno spam-score della HTML-only.
        text: htmlToPlainText(renderedHtml),
        senderOverride: { from, replyTo: sender.email, source: "outreach_single" },
        adminClient: admin,
        metadata: { outreach_single: true, sender_account_id: sender.id, by: userId },
      });
      res = { ok: !(u && u.ok === false), body: u?.body, providerMessageId: u?.providerMessageId ?? null };
    }
    if (!res.ok) {
      return errorResponse(`Invio non riuscito: ${typeof res.body === "string" ? res.body : JSON.stringify(res.body)}`, 502, corsH);
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Contatore atomico (stessa RPC del dispatcher): un invio manuale non deve
    // perdere o sovrascrivere gli incrementi del tick in corso.
    await admin.rpc("outreach_prenota_invio", { p_sender_id: sender.id, p_today: today, p_cap: 1_000_000 });

    // storico nello stesso registro della coda (col testo effettivamente inviato)
    await admin.from("outreach_send_queue").insert({
      company_id: PLATFORM_COMPANY, contact_id: contactId, sender_account_id: sender.id,
      channel: "email", to_email: to, subject: renderedSubject, body: renderedHtml,
      status: "sent", sent_at: now.toISOString(),
      // Un invio a mano a un contatto è comunque uno sconosciuto in più
      // raggiunto oggi da questa casella: conta nel tetto dei nuovi.
      primo_contatto: true,
    });

    return jsonResponse({ ok: true, from }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-send-single error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
