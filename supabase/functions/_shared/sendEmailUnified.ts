// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadProviderSettings,
  sendViaProvider,
  EmailSendResult,
} from "./emailProvider.ts";
import { deductEmailCredits } from "./emailCredits.ts";
import { logEmailDelivery } from "./email-log.ts";

export type EmailStream = "marketing" | "transactional";

export interface UnifiedEmailArgs {
  /** NULL means platform-level email (no per-company billing / logging company_id). */
  companyId: string | null;
  stream: EmailStream;
  to: string | string[];
  subject: string;
  html: string;
  /** Semantic template identifier — stored in `email_delivery_log.template_type`. */
  templateName?: string;
  /** Link log row to a campaign (marketing stream). */
  campaignId?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; type: string }[];
  /** Force-skip wallet deduction even when over quota (e.g. password reset). */
  skipCredits?: boolean;
  /** Admin client. If not provided, one is built from env. */
  adminClient?: SupabaseClient;
  /** Freeform metadata persisted on each log row. */
  metadata?: Record<string, unknown>;
}

export interface UnifiedEmailResult extends EmailSendResult {
  /** Last log row id (one row per recipient is written). */
  deliveryLogId?: string;
  /** Wallet balance before deduction, if applicable. */
  creditsBefore?: number;
  /** Wallet balance after deduction, if applicable. */
  creditsAfter?: number;
  /** Total amount billed to the wallet (0 if within plan quota or free). */
  chargedEur?: number;
  overQuota?: boolean;
  isFree?: boolean;
  /** Effective monthly cap at send time (−1 = unlimited). */
  effectiveLimit?: number;
  /** Emails sent this month before this send. */
  sentThisMonth?: number;
}

function adminClientOrBuild(c?: SupabaseClient): SupabaseClient {
  return c ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Unified send pipeline — the single entry point used by every edge function
 * that emits email. Responsibilities:
 *
 *   1. Load provider config for the given stream
 *   2. Resolve the company's effective quota / pricing via RPC
 *   3. If company is over quota and not flagged free → deduct from wallet
 *      (fails 402 with a logged failure row if insufficient)
 *   4. Send via provider (with 429 backoff inside `sendViaProvider`)
 *   5. Write ONE log row per recipient to `email_delivery_log`
 *
 * Never throws for logging failures. Always returns an `EmailSendResult`
 * extended with billing/quota context so callers can surface the info.
 */
export async function sendEmailUnified(args: UnifiedEmailArgs): Promise<UnifiedEmailResult> {
  const admin = adminClientOrBuild(args.adminClient);
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  const recipientCount = recipients.length;

  // ── 1. Provider settings ─────────────────────────────────────────────────
  const settings = await loadProviderSettings(args.stream);
  if (!settings.apiKey) {
    return {
      ok: false,
      status: 500,
      body: { error: `No provider configured for stream '${args.stream}'.` },
    };
  }

  // ── 2. Quota resolution ──────────────────────────────────────────────────
  let isFree = false;
  let overQuota = false;
  let pricePerEmail = 0;
  let effectiveLimit = 0;
  let sentThisMonth = 0;

  if (args.companyId) {
    try {
      const { data, error } = await admin.rpc("get_company_email_quota", {
        p_company_id: args.companyId,
      });
      if (!error && data) {
        const q = data as Record<string, any>;
        isFree         = Boolean(q.is_free);
        overQuota      = Boolean(q.over_quota);
        pricePerEmail  = Number(q.effective_price_eur ?? 0);
        effectiveLimit = Number(q.effective_limit ?? 0);
        sentThisMonth  = Number(q.sent_this_month ?? 0);
      }
    } catch {
      /* best-effort only; proceed with defaults */
    }
  }

  // ── 3. Wallet deduction when over quota ──────────────────────────────────
  let creditsBefore: number | undefined;
  let creditsAfter: number | undefined;
  let chargedTotal = 0;
  const shouldCharge =
    !!args.companyId &&
    !args.skipCredits &&
    !isFree &&
    overQuota &&
    pricePerEmail > 0;

  if (shouldCharge) {
    chargedTotal = pricePerEmail * recipientCount;
    try {
      const res = await deductEmailCredits(args.companyId!, chargedTotal, {
        description: `${args.stream}:${args.templateName ?? "unknown"} (over-quota ${recipientCount}x)`,
        campaignId:  args.campaignId,
        metadata: {
          over_quota: true,
          recipients: recipientCount,
          stream: args.stream,
          template_name: args.templateName ?? null,
          ...args.metadata,
        },
        adminClient: admin,
      });
      creditsBefore = res.balanceBefore;
      creditsAfter  = res.balanceAfter;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Log one failure row per recipient for accurate reporting
      for (const r of recipients) {
        await logEmailDelivery(admin, {
          company_id:    args.companyId,
          recipient:     r,
          subject:       args.subject,
          template_name: args.templateName,
          status:        "failed",
          provider:      settings.provider,
          stream:        args.stream,
          campaign_id:   args.campaignId ?? null,
          error_message: `Insufficient credits: ${msg}`,
          cost_eur:      0,
          charged_eur:   0,
          metadata:      { insufficient_credits: true, ...args.metadata },
        });
      }
      return {
        ok: false,
        status: 402,
        body: { error: "Crediti email insufficienti", details: msg },
        overQuota,
        isFree,
        effectiveLimit,
        sentThisMonth,
      };
    }
  }

  // ── 4. Send via provider ─────────────────────────────────────────────────
  let result: EmailSendResult;
  try {
    result = await sendViaProvider(settings.provider, settings.apiKey, {
      from:    settings.fromDefault,
      to:      recipients,
      subject: args.subject,
      html:    args.html,
      replyTo: args.replyTo,
      attachments: args.attachments,
    }, { domain: settings.domain ?? undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const r of recipients) {
      await logEmailDelivery(admin, {
        company_id:    args.companyId,
        recipient:     r,
        subject:       args.subject,
        template_name: args.templateName,
        status:        "failed",
        provider:      settings.provider,
        stream:        args.stream,
        campaign_id:   args.campaignId ?? null,
        error_message: msg,
        cost_eur:      0,
        charged_eur:   shouldCharge ? pricePerEmail : 0,
        metadata:      { provider_exception: true, ...args.metadata },
      });
    }
    return {
      ok: false,
      status: 500,
      body: { error: msg },
      overQuota,
      isFree,
      effectiveLimit,
      sentThisMonth,
    };
  }

  // ── 5. Log outcome per recipient ─────────────────────────────────────────
  let lastLogId: string | undefined;
  const providerError = result.ok
    ? undefined
    : (typeof result.body === "object"
        ? JSON.stringify(result.body)
        : String(result.body));

  for (const r of recipients) {
    const { id } = await logEmailDelivery(admin, {
      company_id:    args.companyId,
      recipient:     r,
      subject:       args.subject,
      template_name: args.templateName,
      status:        result.ok ? "sent" : "failed",
      provider:      settings.provider,
      stream:        args.stream,
      campaign_id:   args.campaignId ?? null,
      provider_id:   result.providerMessageId ?? null,
      error_message: providerError,
      cost_eur:      0,
      charged_eur:   result.ok && shouldCharge ? pricePerEmail : 0,
      metadata: {
        over_quota: overQuota,
        is_free: isFree,
        template_name: args.templateName ?? null,
        ...args.metadata,
      },
    });
    if (id) lastLogId = id;
  }

  return {
    ...result,
    deliveryLogId: lastLogId,
    creditsBefore,
    creditsAfter,
    chargedEur: chargedTotal,
    overQuota,
    isFree,
    effectiveLimit,
    sentThisMonth,
  };
}
