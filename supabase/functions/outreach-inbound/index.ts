/**
 * outreach-inbound — ingestione risposte cold (webhook).
 *
 * Riceve email in arrivo (SES inbound via SNS, Mailgun, o reply-to generico),
 * normalizza, scrive in outreach_replies, matcha il contatto e — su risposta —
 * FERMA la sequenza (enrollment 'replied' + annulla i messaggi in coda).
 *
 * Auth: header `x-inbound-secret` o query `?secret=` == OUTREACH_INBOUND_SECRET.
 * Gestisce anche la conferma di sottoscrizione SNS (self-auth AWS).
 * Pubblico (verify_jwt=false) ma secret-gated. Richiede tabelle outreach_*.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { normalizeInbound, isSnsSubscriptionConfirmation } from "../_shared/outreach-inbound-logic.ts";
import { classifyDeliveryEvent, shouldPauseSender, type DeliveryEvent } from "../_shared/outreach-reputation.ts";
import { handleInboundReply } from "../_shared/outreach-reply-handler.ts";
import { idsCitati, scegliInvio, testoInvito, type InvioFatto } from "../_shared/outreachRispostaBrand.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_SECRET = Deno.env.get("OUTREACH_INBOUND_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }

  // 1. Conferma sottoscrizione SNS (AWS la firma: confermiamo visitando l'URL)
  if (isSnsSubscriptionConfirmation(body)) {
    const sub = body?.SubscribeURL;
    if (sub) { try { await fetch(sub); } catch { /* best effort */ } }
    return json({ confirmed: true }, 200, cors);
  }

  // 2. Auth a secret condiviso
  const url = new URL(req.url);
  const secret = req.headers.get("x-inbound-secret") || url.searchParams.get("secret") || "";
  if (!INBOUND_SECRET || secret !== INBOUND_SECRET) return json({ error: "unauthorized" }, 401, cors);

  // 3. Unwrap SNS Notification (Message JSON annidato)
  let payload = body;
  if (body && typeof body.Message === "string") {
    try { payload = JSON.parse(body.Message); } catch { /* lascia body */ }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const nowIso = new Date().toISOString();

  // 3b. Evento di recapito (bounce/complaint)? → blocklist + stop + auto-pausa casella
  const delivery = classifyDeliveryEvent(payload);
  if (delivery.type !== "none" && delivery.emails.length) {
    try {
      const res = await handleDeliveryEvent(supabase, delivery, body, nowIso);
      return json({ ok: true, ...res }, 200, cors);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
    }
  }

  // 4. Altrimenti è una risposta in arrivo: normalizza
  const norm = normalizeInbound(payload) ?? normalizeInbound(body);
  if (!norm) return json({ error: "payload non interpretabile" }, 422, cors);

  try {
    // 5. Matcha il contatto (per email, case-insensitive)
    const { data: contact } = await supabase
      .from("marketing_contacts").select("id")
      .eq("company_id", PLATFORM_COMPANY).ilike("email", norm.fromEmail).maybeSingle();
    const contactId = contact?.id ?? null;

    // 6. A quale invio — e quindi a quale BRAND — sta rispondendo? Stessa
    // scelta del poller IMAP (_shared/outreachRispostaBrand): header citato,
    // poi la casella a cui è arrivata, poi il brand di quella casella.
    let enrollmentId: string | null = null;
    let brandId: string | null = null;
    let senderAccountId: string | null = null;
    let invito: string | null = null;
    if (contactId) {
      if (norm.toEmail) {
        const { data: mb } = await supabase.from("outreach_sender_accounts")
          .select("id, brand_id").ilike("email", norm.toEmail).limit(1).maybeSingle();
        senderAccountId = mb?.id ?? null;
        brandId = mb?.brand_id ?? null;
      }
      const { data: invii } = await supabase.from("outreach_send_queue")
        .select("enrollment_id, brand_id, sender_account_id, message_id, sent_at")
        .eq("company_id", PLATFORM_COMPANY).eq("contact_id", contactId).eq("status", "sent")
        .order("sent_at", { ascending: false }).limit(50);
      const scelta = scegliInvio((invii ?? []) as InvioFatto[], {
        casellaId: senderAccountId,
        brandCasella: brandId,
        citati: idsCitati(norm.inReplyTo, (norm.headers?.references ?? "").split(/\s+/)),
      });
      enrollmentId = scelta?.invio.enrollment_id ?? null;
      if (!brandId) brandId = scelta?.invio.brand_id ?? null;
      invito = testoInvito(scelta, norm.toEmail);
      if (!enrollmentId) {
        const { data: enr } = await supabase
          .from("outreach_enrollments").select("id")
          .eq("company_id", PLATFORM_COMPANY).eq("contact_id", contactId).eq("status", "active").limit(1).maybeSingle();
        enrollmentId = enr?.id ?? null;
      }
    }

    // 7. Gestisci la risposta (inbox + intent + stop sequenza + opt-out).
    // Logica condivisa col poller IMAP (outreach-imap-poll): _shared/outreach-reply-handler.
    await handleInboundReply(supabase, {
      contactId, enrollmentId, brandId, senderAccountId, invito,
      from: norm.fromEmail, subject: norm.subject ?? "", text: norm.snippet ?? "",
      messageId: norm.messageId,
      headers: norm.headers,
      casella: norm.toEmail,
    });

    return json({ ok: true, matched: !!contactId, stopped: !!enrollmentId }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

/**
 * Gestisce un bounce/complaint: mette in blocklist gli indirizzi, opt-out del
 * contatto, ferma le sue iscrizioni, incrementa i contatori della casella che
 * ha spedito e — se la reputazione scende sotto soglia — mette la casella in
 * pausa per proteggere il pool.
 */
async function handleDeliveryEvent(supabase: any, ev: DeliveryEvent, rawBody: any, nowIso: string) {
  const reason = ev.type === "complaint" ? "spam_complaint" : "hard_bounce";
  const pausedSenders = new Set<string>();

  for (const email of ev.emails) {
    // blocklist (idempotente sullo stesso motivo)
    await supabase.from("email_suppressions").upsert(
      { company_id: PLATFORM_COMPANY, email, reason, notes: `Outreach ${ev.type}${ev.permanent ? " permanente" : ""}` },
      { onConflict: "company_id,email_normalized,reason" },
    );

    // contatto → opt-out + stop iscrizioni attive
    const { data: contact } = await supabase
      .from("marketing_contacts").select("id").eq("company_id", PLATFORM_COMPANY).ilike("email", email).maybeSingle();
    if (contact?.id) {
      await supabase.from("marketing_contacts")
        .update({ optout_email: true, optout_at: nowIso, optout_reason: reason }).eq("id", contact.id);
      const { data: enrs } = await supabase
        .from("outreach_enrollments").select("id")
        .eq("company_id", PLATFORM_COMPANY).eq("contact_id", contact.id).eq("status", "active");
      for (const e of enrs ?? []) {
        await supabase.from("outreach_enrollments")
          .update({ status: ev.type === "complaint" ? "opted_out" : "bounced", next_action_at: null, stop_reason: reason })
          .eq("id", e.id);
        await supabase.from("outreach_send_queue")
          .update({ status: "cancelled" }).eq("enrollment_id", e.id).eq("status", "queued");
      }
    }

    // casella che ha spedito a questo indirizzo (più recente) → contatori + auto-pausa
    const { data: q } = await supabase
      .from("outreach_send_queue").select("sender_account_id")
      .eq("company_id", PLATFORM_COMPANY).ilike("to_email", email)
      .not("sender_account_id", "is", null).order("sent_at", { ascending: false }).limit(1).maybeSingle();
    const senderId = q?.sender_account_id ?? null;
    if (senderId) {
      const { data: s } = await supabase
        .from("outreach_sender_accounts").select("id,bounce_count,complaint_count,status").eq("id", senderId).maybeSingle();
      if (s) {
        const bounceCount = (s.bounce_count ?? 0) + (ev.type === "bounce" ? 1 : 0);
        const complaintCount = (s.complaint_count ?? 0) + (ev.type === "complaint" ? 1 : 0);
        const { count: sentCount } = await supabase
          .from("outreach_send_queue").select("id", { count: "exact", head: true })
          .eq("sender_account_id", senderId).eq("status", "sent");
        const upd: Record<string, unknown> = { bounce_count: bounceCount, complaint_count: complaintCount };
        if (s.status !== "disabled" && shouldPauseSender({ sent: sentCount ?? 0, bounceCount, complaintCount })) {
          upd.status = "paused";
          pausedSenders.add(senderId);
        }
        await supabase.from("outreach_sender_accounts").update(upd).eq("id", senderId);
      }
    }
  }

  return { type: ev.type, processed: ev.emails.length, senders_paused: pausedSenders.size };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
