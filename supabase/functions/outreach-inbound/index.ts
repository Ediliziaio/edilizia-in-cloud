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

  // 3. Normalizza (gestisce anche payload SNS Notification con Message JSON annidato)
  let payload = body;
  if (body && typeof body.Message === "string") {
    try { payload = JSON.parse(body.Message); } catch { /* lascia body */ }
  }
  const norm = normalizeInbound(payload) ?? normalizeInbound(body);
  if (!norm) return json({ error: "payload non interpretabile" }, 422, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const nowIso = new Date().toISOString();

  try {
    // 4. Matcha il contatto (per email, case-insensitive)
    const { data: contact } = await supabase
      .from("marketing_contacts").select("id")
      .eq("company_id", PLATFORM_COMPANY).ilike("email", norm.fromEmail).maybeSingle();
    const contactId = contact?.id ?? null;

    // 5. Enrollment attivo per quel contatto?
    let enrollmentId: string | null = null;
    if (contactId) {
      const { data: enr } = await supabase
        .from("outreach_enrollments").select("id")
        .eq("company_id", PLATFORM_COMPANY).eq("contact_id", contactId).eq("status", "active").maybeSingle();
      enrollmentId = enr?.id ?? null;
    }

    // 6. Scrivi la risposta nell'inbox
    const { error: insErr } = await supabase.from("outreach_replies").insert({
      company_id: PLATFORM_COMPANY, contact_id: contactId, enrollment_id: enrollmentId,
      channel: "email", from_email: norm.fromEmail, subject: norm.subject, snippet: norm.snippet,
      status: "unread", received_at: nowIso, raw: body ?? {},
    });
    if (insErr) throw insErr;

    // 7. STOP su risposta: ferma la sequenza e annulla i messaggi ancora in coda
    if (enrollmentId) {
      await supabase.from("outreach_enrollments")
        .update({ status: "replied", stop_reason: "Risposta del destinatario" }).eq("id", enrollmentId);
      await supabase.from("outreach_send_queue")
        .update({ status: "cancelled" }).eq("enrollment_id", enrollmentId).eq("status", "queued");
    }

    return json({ ok: true, matched: !!contactId, stopped: !!enrollmentId }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
