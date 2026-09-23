/**
 * send-error-ticket — Riceve dettagli errore dall'ErrorBoundary del frontend
 * e invia notifica email a flo.andriciuc@gmail.com + log su system_health_metrics
 * con flag ticket_opened=true.
 *
 * Permette al super-admin di reagire immediatamente ai crash in prod senza
 * dover aspettare report frammentari dagli utenti.
 *
 * Endpoint POST:
 *   {
 *     error_name: string,
 *     error_message: string,
 *     stack?: string,
 *     component_stack?: string,
 *     url: string,
 *     user_agent: string,
 *     extra_note?: string (testo opzionale utente)
 *   }
 *
 * Auth: Bearer (utente loggato). Estrae profile.full_name + company.name dal token.
 *
 * Output:
 *   { ok: true, ticket_id: uuid, emailed: boolean }
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

// Destinatario fisso super-admin
const SUPER_ADMIN_EMAIL = "flo.andriciuc@gmail.com";
const FROM_EMAIL = "EdiliziaInCloud Alerts <alerts@ediliziaincloud.com>";

interface TicketBody {
  error_name: string;
  error_message: string;
  stack?: string;
  component_stack?: string;
  url: string;
  user_agent: string;
  extra_note?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // ─── Auth utente — opzionale ma preferita per identificare il segnalante ──
    let userId: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = null;
    let companyId: string | null = null;
    let companyName: string | null = null;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userResp } = await supabase.auth.getUser(token);
      if (userResp.user) {
        userId = userResp.user.id;
        userEmail = userResp.user.email ?? null;

        // Profile + company name
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company_id")
          .eq("id", userId)
          .maybeSingle();
        if (profile) {
          userName = profile.full_name as string | null;
          companyId = profile.company_id as string | null;
          if (companyId) {
            const { data: comp } = await supabase
              .from("companies")
              .select("name")
              .eq("id", companyId)
              .maybeSingle();
            companyName = (comp?.name as string | null) ?? null;
          }
        }
      }
    }

    // ─── Parse body ───────────────────────────────────────────────────────
    const body = (await req.json()) as TicketBody;
    if (!body.error_message || !body.url) {
      return json({ error: "error_message + url required" }, 400, corsHeaders);
    }

    const timestamp = new Date().toISOString();
    const userLabel = userName || userEmail || "Utente anonimo";
    const companyLabel = companyName || "Azienda sconosciuta";

    // ─── Log su system_health_metrics ─────────────────────────────────────
    let ticketId: string | null = null;
    try {
      const { data: inserted } = await supabase
        .from("system_health_metrics")
        .insert({
          metric_type: "error_ticket_user",
          function_name: "ErrorBoundary",
          error_message: `[TICKET] ${body.error_name || "Error"}: ${body.error_message.substring(0, 400)}`,
          metadata: {
            ticket_opened: true,
            user_id: userId,
            user_name: userName,
            user_email: userEmail,
            company_id: companyId,
            company_name: companyName,
            url: body.url,
            user_agent: body.user_agent?.substring(0, 300) ?? "",
            stack: body.stack?.substring(0, 2000) ?? null,
            component_stack: body.component_stack?.substring(0, 1500) ?? null,
            extra_note: body.extra_note?.substring(0, 1000) ?? null,
            timestamp,
          },
        })
        .select("id")
        .maybeSingle();
      ticketId = (inserted?.id as string | null) ?? null;
    } catch (e) {
      console.warn("[send-error-ticket] insert health metric failed", e);
    }

    // ─── Invia email super-admin via Resend ───────────────────────────────
    let emailed = false;
    if (RESEND_API_KEY) {
      try {
        const subject = `Errore EiC — ${companyLabel} — ${shortPath(body.url)}`;
        const html = buildEmailHtml({
          userLabel,
          userEmail,
          companyLabel,
          companyId,
          url: body.url,
          errorName: body.error_name,
          errorMessage: body.error_message,
          stack: body.stack,
          componentStack: body.component_stack,
          userAgent: body.user_agent,
          extraNote: body.extra_note,
          timestamp,
          ticketId,
        });

        const resendResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [SUPER_ADMIN_EMAIL],
            subject,
            html,
            reply_to: userEmail || undefined,
          }),
        });

        if (resendResp.ok) {
          emailed = true;
        } else {
          const errText = await resendResp.text();
          console.error("[send-error-ticket] Resend error", resendResp.status, errText);
        }
      } catch (e) {
        console.error("[send-error-ticket] email send failed", e);
      }
    } else {
      console.warn("[send-error-ticket] RESEND_API_KEY missing — email not sent");
    }

    return json({ ok: true, ticket_id: ticketId, emailed }, 200, corsHeaders);
  } catch (e) {
    console.error("[send-error-ticket] error", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
      corsHeaders,
    );
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.substring(0, 60);
  } catch {
    return url.substring(0, 60);
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EmailParams {
  userLabel: string;
  userEmail: string | null;
  companyLabel: string;
  companyId: string | null;
  url: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
  componentStack?: string;
  userAgent: string;
  extraNote?: string;
  timestamp: string;
  ticketId: string | null;
}

function buildEmailHtml(p: EmailParams): string {
  const path = shortPath(p.url);
  const userEmailLine = p.userEmail ? ` (${escapeHtml(p.userEmail)})` : "";
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f8f9fa;color:#111">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
    <div style="display:inline-block;background:#fee2e2;color:#991b1b;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:16px">🚨 ERRORE PAGINA</div>

    <h1 style="font-size:22px;margin:0 0 8px;color:#111">Un utente ha aperto un ticket assistenza</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px">Il bottone "Invia ticket" è stato cliccato dalla schermata di errore dell'app.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;width:140px;font-size:13px">Utente</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:14px">${escapeHtml(p.userLabel)}${userEmailLine}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">Azienda</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:14px">${escapeHtml(p.companyLabel)}${p.companyId ? ` <span style="color:#9ca3af;font-weight:400;font-family:monospace;font-size:11px">${escapeHtml(p.companyId.substring(0, 8))}…</span>` : ""}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">Pagina</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:13px;color:#dc2626">${escapeHtml(path)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">Quando</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px">${escapeHtml(p.timestamp)}</td></tr>
      ${p.ticketId ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px">Ticket ID</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:11px">${escapeHtml(p.ticketId)}</td></tr>` : ""}
    </table>

    <h2 style="font-size:14px;margin:24px 0 8px;color:#374151">Errore</h2>
    <pre style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;color:#991b1b;font-size:12px;overflow-x:auto;margin:0;white-space:pre-wrap;word-break:break-word"><strong>${escapeHtml(p.errorName || "Error")}</strong>: ${escapeHtml(p.errorMessage)}</pre>

    ${p.extraNote ? `<h2 style="font-size:14px;margin:24px 0 8px;color:#374151">Nota dell'utente</h2><p style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;font-size:13px;margin:0;color:#92400e;font-style:italic;white-space:pre-wrap">${escapeHtml(p.extraNote)}</p>` : ""}

    ${p.componentStack ? `<details style="margin-top:24px"><summary style="cursor:pointer;font-size:13px;color:#6b7280;font-weight:600">Component Stack (React)</summary><pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:11px;overflow-x:auto;margin:8px 0 0;color:#374151;white-space:pre-wrap">${escapeHtml(p.componentStack.substring(0, 1500))}</pre></details>` : ""}

    ${p.stack ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;color:#6b7280;font-weight:600">Stack Trace</summary><pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:11px;overflow-x:auto;margin:8px 0 0;color:#374151;white-space:pre-wrap">${escapeHtml(p.stack.substring(0, 2000))}</pre></details>` : ""}

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
      <p style="font-size:11px;color:#9ca3af;margin:0">User-Agent: ${escapeHtml(p.userAgent.substring(0, 200))}</p>
      <p style="font-size:11px;color:#9ca3af;margin:4px 0 0">URL completa: <a href="${escapeHtml(p.url)}" style="color:#3b82f6">${escapeHtml(p.url.substring(0, 100))}</a></p>
    </div>

    <p style="font-size:11px;color:#9ca3af;margin:24px 0 0;text-align:center">Inviato automaticamente da EdiliziaInCloud · ErrorBoundary</p>
  </div>
</body>
</html>`;
}

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
