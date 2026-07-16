// deno-lint-ignore-file no-explicit-any
// ─────────────────────────────────────────────────────────────────────────────
// email-inbound-reply — Reply GHL-style (inbound parse)
//
// Riceve il POST inbound di Elastic Email per gli indirizzi
// r-<route_id>@<email_reply_domain> (es. replies.eic-mail.com), risale al
// contatto via email_reply_routes e scrive la risposta in email_inbox
// (matched_contact_id) → compare in tempo reale in /azienda/email e nella
// timeline del contatto. Inoltra anche una copia di cortesia al Reply-To
// dell'azienda così nessuna risposta si perde fuori dal gestionale.
//
// Deploy con --no-verify-jwt (Elastic Email non manda JWT). Autenticazione:
// il route id è un uuid non indovinabile; in più, se il secret
// INBOUND_EMAIL_SECRET è configurato, la URL della route inbound deve
// includere ?key=<secret>.
//
// Risponde SEMPRE 200 (tranne 403 su secret errato): un 5xx farebbe
// ritentare il provider all'infinito su payload malformati.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProviderWithFailover, loadProviderSettings } from "../_shared/emailProvider.ts";
import { resolveSender } from "../_shared/resolveSender.ts";

const ADDR_RE = /(r-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@[a-z0-9.-]+)/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function pick(fields: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = fields[n];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return "";
}

function parseAddress(raw: string): { email: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: raw.trim().toLowerCase(), name: null };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, info: "email-inbound-reply" });

  const secret = Deno.env.get("INBOUND_EMAIL_SECRET");
  if (secret) {
    const key = new URL(req.url).searchParams.get("key");
    if (key !== secret) return json({ error: "forbidden" }, 403);
  }

  // ── Parse difensivo del payload (multipart / urlencoded / json) ───────────
  const fields: Record<string, string> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") fields[k.toLowerCase()] = v;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      for (const [k, v] of Object.entries(body ?? {})) {
        if (typeof v === "string") fields[k.toLowerCase()] = v;
      }
    }
  } catch (e) {
    console.error("[email-inbound-reply] parse body fallito:", e);
    return json({ ok: false, skipped: "unparseable_body" });
  }

  // L'indirizzo r-<uuid>@ può stare in campi diversi a seconda del formato
  // inbound del provider: cerchiamo prima nei campi canonici, poi ovunque.
  const toCandidates = [
    pick(fields, "to", "recipient", "envelope_to", "rcpt", "x-original-to", "delivered-to"),
    JSON.stringify(fields).slice(0, 20_000),
  ].join(" ");
  const addrMatch = toCandidates.match(ADDR_RE);
  if (!addrMatch) {
    console.warn("[email-inbound-reply] nessun indirizzo r-<id>@ nel payload; campi:", Object.keys(fields).join(","));
    return json({ ok: true, skipped: "no_route_address" });
  }
  const routeAddress = addrMatch[1].toLowerCase();
  const routeId = addrMatch[2].toLowerCase();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: route } = await admin
    .from("email_reply_routes")
    .select("id, company_id, contact_id, replies_count")
    .eq("id", routeId)
    .maybeSingle();
  if (!route) {
    console.warn("[email-inbound-reply] route sconosciuta:", routeId);
    return json({ ok: true, skipped: "unknown_route" });
  }

  const from = parseAddress(pick(fields, "from", "sender", "from_email"));
  const subject = pick(fields, "subject").slice(0, 500) || "(senza oggetto)";
  const text = pick(fields, "text", "body_text", "text_body", "plain", "body");
  const html = pick(fields, "html", "body_html", "html_body");
  const messageId =
    pick(fields, "messageid", "message-id", "message_id") ||
    `inbound-${routeId}-${Date.now()}`;

  const { data: contact } = await admin
    .from("marketing_contacts")
    .select("id, first_name, last_name, email")
    .eq("id", route.contact_id)
    .maybeSingle();
  const contactName =
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || null;

  // ── 1. Scrivi la risposta nel gestionale (inbox + timeline contatto) ──────
  const { error: insErr } = await admin.from("email_inbox").insert({
    company_id: route.company_id,
    message_id: messageId,
    from_email: from.email || contact?.email || "sconosciuto@inbound",
    from_name: from.name ?? contactName,
    to_email: routeAddress,
    subject,
    raw_text: text || null,
    raw_html: html || null,
    received_at: new Date().toISOString(),
    status: "new",
    ai_category: "pending",
    ai_priority: "nessuna",
    is_read: false,
    is_archived: false,
    is_trashed: false,
    is_personale: false,
    mailbox_folder: "inbox",
    matched_contact_id: route.contact_id,
    headers: { inbound: "elastic_email", reply_route_id: routeId },
  });
  if (insErr) {
    // Duplicato (retry del provider sullo stesso Message-ID) = già gestita.
    if (String(insErr.message ?? "").includes("duplicate")) {
      return json({ ok: true, skipped: "duplicate" });
    }
    console.error("[email-inbound-reply] insert email_inbox fallito:", insErr.message);
    return json({ ok: false, error: "insert_failed" });
  }

  await admin
    .from("email_reply_routes")
    .update({
      last_reply_at: new Date().toISOString(),
      replies_count: (route.replies_count ?? 0) + 1,
    })
    .eq("id", routeId);

  // ── 2. Copia di cortesia alla casella dell'azienda ────────────────────────
  // Nessun addebito crediti: è un servizio della piattaforma, il costo
  // Elastic Email è irrisorio. Reply-To = il contatto, così l'azienda può
  // rispondere direttamente anche dalla propria casella.
  try {
    const { data: prefs } = await admin
      .from("company_email_preferences")
      .select("reply_to_email")
      .eq("company_id", route.company_id)
      .maybeSingle();
    const forwardTo = (prefs?.reply_to_email as string | undefined)?.trim();
    if (forwardTo && forwardTo.includes("@")) {
      const provider = await loadProviderSettings("marketing");
      if (provider.apiKey) {
        const sender = await resolveSender(route.company_id, "marketing", admin).catch(() => null);
        const bodyHtml =
          html ||
          `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtml(text || "")}</div>`;
        const banner =
          `<div style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px">` +
          `Risposta di ${escapeHtml(contactName || from.email)} (${escapeHtml(from.email)}) — ` +
          `la trovi anche nel gestionale, nella scheda del contatto.` +
          `</div>`;
        await sendViaProviderWithFailover("marketing", provider, {
          from: sender?.from ?? provider.fromDefault,
          replyTo: from.email || undefined,
          to: [forwardTo],
          subject,
          html: banner + bodyHtml,
        }, {
          domain: sender?.domain ?? provider.domain ?? undefined,
          stream: "marketing",
          disableNativeTracking: true,
        });
      }
    }
  } catch (e) {
    console.warn("[email-inbound-reply] inoltro di cortesia fallito:", e);
  }

  return json({ ok: true });
});
