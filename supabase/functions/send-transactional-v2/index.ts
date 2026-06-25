// deno-lint-ignore-file no-explicit-any
// ============================================================================
// send-transactional-v2 — Email Dual-Provider FASE 7
// ============================================================================
// Pipeline template-based per email transazionali (fatture, DDT, preventivi,
// reset password, welcome, inviti utenti, scadenze).
//
// Componenti:
//   1. Auth JWT + verifyCompanyAccess (o super_admin per companyId null)
//   2. Rate limit 120/min per utente
//   3. resolveSender(companyId, "transactional") → from/replyTo/provider
//      (stream-aware: Resend verificato OPPURE SendGrid CNAMEs OK)
//   4. renderEmailTemplate(templateName, companyId, props) → subject+html+text
//      con branding da company_email_preferences
//   5. is_suppressed(email, companyId) per recipient → skip se hard_bounce
//      o spam_complaint globale (marketing unsubscribe non blocca transactional)
//   6. sendEmailUnified con senderOverride pre-risolto → invio + log per recipient
//
// Compatibilità: le 28 Edge Function esistenti continuano a chiamare
// sendEmailUnified direttamente. Questa v2 è per callers nuovi/refactor che
// vogliono il pipeline completo template + branding + suppression.
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { resolveSender } from "../_shared/resolveSender.ts";
import { renderEmailTemplate, type TemplateName, AVAILABLE_TEMPLATES } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const RATE_LIMIT_MAX = 120;      // bulk-friendly (fattura run, invito massivo)
const RATE_LIMIT_WINDOW = 60;    // seconds

interface SendRequest {
  companyId: string | null;
  templateName: TemplateName;
  props: Record<string, unknown>;
  to: string | string[];
  unsubscribeUrl?: string | null;
  brandingOverride?: Record<string, unknown>;
  replyTo?: string;
  skipCredits?: boolean;
  campaignId?: string;
  metadata?: Record<string, unknown>;
}

interface RecipientResult {
  recipient: string;
  status: "sent" | "suppressed" | "failed";
  deliveryLogId?: string;
  error?: string;
}

function json(
  data: unknown,
  status = 200,
  cors: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...secureHeaders, ...cors, "Content-Type": "application/json" },
  });
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function assertSuperAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  return data === true;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  try {
    // ── 1. Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    // ── 2. Parse + validate body ──────────────────────────────────────────
    let body: SendRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, cors);
    }

    if (!body.templateName || typeof body.templateName !== "string") {
      return json({ error: "templateName required" }, 400, cors);
    }
    if (!AVAILABLE_TEMPLATES.includes(body.templateName as TemplateName)) {
      return json({
        error: `Unknown template '${body.templateName}'. Available: ${AVAILABLE_TEMPLATES.join(", ")}`,
      }, 400, cors);
    }
    if (!body.props || typeof body.props !== "object") {
      return json({ error: "props (object) required" }, 400, cors);
    }

    const recipients = Array.isArray(body.to) ? body.to : body.to ? [body.to] : [];
    if (recipients.length === 0) {
      return json({ error: "to (email or string[]) required" }, 400, cors);
    }
    const invalidEmails = recipients.filter((r) => !isEmail(r));
    if (invalidEmails.length > 0) {
      return json({
        error: `Indirizzi email non validi: ${invalidEmails.join(", ")}`,
      }, 400, cors);
    }

    const companyId = body.companyId ?? null;

    // ── 3. Authorization check ────────────────────────────────────────────
    if (companyId) {
      try {
        await verifyCompanyAccess(admin, user.id, companyId);
      } catch {
        return json({ error: "Non autorizzato: accesso negato a questa azienda" }, 403, cors);
      }
    } else {
      // companyId null → piattaforma → super_admin only
      const isSuperAdmin = await assertSuperAdmin(admin, user.id);
      if (!isSuperAdmin) {
        return json({ error: "Solo super_admin può inviare email a livello piattaforma" }, 403, cors);
      }
    }

    // ── 4. Rate limit ─────────────────────────────────────────────────────
    const rl = await checkRateLimit({
      functionName: "send-transactional-v2",
      callerId: user.id,
      maxCalls: RATE_LIMIT_MAX,
      windowSeconds: RATE_LIMIT_WINDOW,
    });
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterSeconds ?? RATE_LIMIT_WINDOW, cors);
    }

    // ── 5. Resolve sender + render template in parallel ───────────────────
    let sender: Awaited<ReturnType<typeof resolveSender>>;
    let rendered: Awaited<ReturnType<typeof renderEmailTemplate>>;
    try {
      [sender, rendered] = await Promise.all([
        resolveSender(companyId, "transactional", admin),
        renderEmailTemplate({
          templateName: body.templateName as TemplateName,
          companyId,
          props: body.props as any,
          adminClient: admin,
          brandingOverride: body.brandingOverride,
          unsubscribeUrl: body.unsubscribeUrl ?? null,
        }),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: `Render/sender error: ${msg}` }, 500, cors);
    }

    // ── 6. Suppression check per recipient ────────────────────────────────
    const results: RecipientResult[] = [];
    const sendable: string[] = [];

    for (const r of recipients) {
      const { data: suppressed, error: supErr } = await admin.rpc("is_suppressed_for_stream", {
        p_email: r,
        p_company_id: companyId,
        p_stream: "transactional",
      });
      if (supErr) {
        // Fail-open: meglio inviare che perdere email critiche (password reset etc.)
        console.warn("[send-transactional-v2] is_suppressed error", {
          company_id: companyId,
          message:    supErr.message,
        });
        sendable.push(r);
        continue;
      }
      if (suppressed === true) {
        results.push({ recipient: r, status: "suppressed" });
      } else {
        sendable.push(r);
      }
    }

    if (sendable.length === 0) {
      return json({
        success: true,
        results,
        overQuota: false,
        chargedEur: 0,
        isFree: false,
        remaining: -1,
        note: "Tutti i destinatari sono in suppression list",
      }, 200, cors);
    }

    // ── 7. Dispatch to sendEmailUnified with resolved sender ──────────────
    const sendResult = await sendEmailUnified({
      companyId,
      stream: "transactional",
      to: sendable,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateName: body.templateName,
      campaignId: body.campaignId,
      replyTo: body.replyTo,
      skipCredits: body.skipCredits,
      adminClient: admin,
      metadata: {
        ...(body.metadata ?? {}),
        template_name: body.templateName,
        provider_used: sender.provider,
      },
      senderOverride: {
        from: sender.from,
        replyTo: body.replyTo ?? sender.replyTo,
        customDomainId: sender.customDomainId ?? null,
        customDomain: sender.usingCustomDomain ? sender.domain : null,
        usingCustomDomain: sender.usingCustomDomain,
        source: sender.source,
      },
    });

    // ── 8. Build per-recipient results from aggregate ─────────────────────
    for (const r of sendable) {
      if (sendResult.ok) {
        results.push({ recipient: r, status: "sent", deliveryLogId: sendResult.deliveryLogId });
      } else {
        const errMsg =
          typeof sendResult.body === "object"
            ? JSON.stringify(sendResult.body)
            : String(sendResult.body ?? "unknown");
        results.push({ recipient: r, status: "failed", error: errMsg });
      }
    }

    // ── 9. Shape response ────────────────────────────────────────────────
    if (!sendResult.ok) {
      const status = sendResult.status === 402 ? 402 : 500;
      const errorMsg =
        sendResult.status === 402
          ? "Crediti email insufficienti — ricarica il wallet per continuare."
          : typeof sendResult.body === "object" && (sendResult.body as any)?.error
            ? String((sendResult.body as any).error)
            : "Invio email fallito";
      return json({
        success: false,
        error: errorMsg,
        results,
        overQuota: sendResult.overQuota ?? false,
        chargedEur: sendResult.chargedEur ?? 0,
        isFree: sendResult.isFree ?? false,
      }, status, cors);
    }

    const remaining =
      sendResult.effectiveLimit === -1
        ? -1
        : Math.max(
            0,
            (sendResult.effectiveLimit ?? 0) -
              (sendResult.sentThisMonth ?? 0) -
              sendable.length,
          );

    return json({
      success: true,
      results,
      overQuota: sendResult.overQuota ?? false,
      chargedEur: sendResult.chargedEur ?? 0,
      isFree: sendResult.isFree ?? false,
      effectiveLimit: sendResult.effectiveLimit ?? 0,
      remaining,
      provider: sender.provider,
      senderSource: sender.source,
      usingCustomDomain: sender.usingCustomDomain,
    }, 200, cors);
  } catch (e) {
    console.error("[send-transactional-v2] unexpected error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500, cors);
  }
});

// redeploy 2026-06-25: propaga _shared email/branding (.it→.com + builder 58 email) — trigger CI HEAD~1 diff
