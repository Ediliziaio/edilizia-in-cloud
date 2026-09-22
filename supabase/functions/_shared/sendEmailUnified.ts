// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadProviderSettings,
  sendViaProvider,
  sendViaProviderWithFailover,
  EmailSendResult,
} from "./emailProvider.ts";
import { addEmailCredits, deductEmailCredits } from "./emailCredits.ts";
import { logEmailDelivery } from "./email-log.ts";
import { resolveSender } from "./resolveSender.ts";
import {
  getSuppressedEmailMap,
  normalizeRecipientList,
  normalizeEmailAddress,
} from "./emailSuppression.ts";

export type EmailStream = "marketing" | "transactional";

export interface UnifiedEmailArgs {
  /** NULL means platform-level email (no per-company billing / logging company_id). */
  companyId: string | null;
  stream: EmailStream;
  to: string | string[];
  subject: string;
  html: string;
  /** Optional plain-text alternative. Callers using templates should pass the text version. */
  text?: string;
  /** Semantic template identifier — stored in `email_delivery_log.template_type`. */
  templateName?: string;
  /** Link log row to a campaign (marketing stream). */
  campaignId?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; type: string }[];
  /** Provider-specific headers, e.g. List-Unsubscribe for marketing sends. */
  headers?: Record<string, string>;
  /** Force-skip wallet deduction even when over quota (e.g. password reset). */
  skipCredits?: boolean;
  /** Admin client. If not provided, one is built from env. */
  adminClient?: SupabaseClient;
  /** Freeform metadata persisted on each log row. */
  metadata?: Record<string, unknown>;
  /**
   * Pre-resolved sender. When provided, the internal `company_email_domains`
   * lookup is skipped and these values are used verbatim.
   * Used by `send-transactional-v2` which relies on `_shared/resolveSender.ts`
   * for stream-aware dual-provider (Resend / SendGrid / Elastic Email) routing.
   */
  senderOverride?: {
    from: string;
    replyTo?: string;
    customDomainId?: string | null;
    customDomain?: string | null;
    usingCustomDomain?: boolean;
    /** Provenance string persisted in the log metadata (e.g. "platform_default", "custom_domain_transactional"). */
    source?: string;
  };
  /**
   * Per-mailbox SMTP override (Outreach cold mailboxes with provider='smtp').
   * When provided, the send goes out via this mailbox's own SMTP server instead
   * of the Elastic Email / provider-with-failover path. Suppression checks and
   * delivery logging still apply. Does NOT require the EE apiKey to be set.
   */
  mailboxOverride?: { host: string; port: number; secure: boolean; username: string; password: string };
  /**
   * Email della PIATTAFORMA verso il cliente (benvenuto, ricevuta abbonamento,
   * solleciti di sistema). `companyId` resta valorizzato per il log, ma il
   * mittente NON deve essere quello del tenant: senza questo flag il cliente
   * riceve da "<nome della sua stessa azienda> via EdiliziaInCloud", cioè da
   * se stesso. Bug reale visto in produzione il 27/07/2026.
   */
  platformSender?: boolean;
  /**
   * Email di servizio (stream transazionale: regole di soppressione e conteggi
   * restano quelli) spedita però dal provider del marketing, con la classe
   * transazionale di Elastic Email. Serve quando il mittente scelto sta su un
   * dominio verificato solo sul provider del marketing: le email degli
   * appuntamenti di Edilizia in Cloud da mkt.ediliziaincloud.com (22/09/2026).
   * Niente tracciamento dei link: il link della videochiamata resta quello vero.
   */
  viaMarketingProvider?: boolean;
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
  const normalized = normalizeRecipientList(args.to);
  let recipients = normalized.valid;

  // ── 1. Provider settings ─────────────────────────────────────────────────
  // Per mailboxOverride (casella SMTP propria) l'apiKey EE non serve: l'invio
  // non passa dal provider-with-failover. In quel caso non blocchiamo qui.
  const streamProvider = args.viaMarketingProvider ? "marketing" : args.stream;
  const settings = await loadProviderSettings(streamProvider);
  if (!settings.apiKey && !args.mailboxOverride) {
    return {
      ok: false,
      status: 500,
      body: { error: `No provider configured for stream '${args.stream}'.` },
    };
  }

  for (const invalid of normalized.invalid) {
    await logEmailDelivery(admin, {
      company_id:    args.companyId,
      recipient:     String(invalid ?? ""),
      subject:       args.subject,
      template_name: args.templateName,
      status:        "failed",
      provider:      settings.provider,
      stream:        args.stream,
      campaign_id:   args.campaignId ?? null,
      error_message: "Indirizzo email non valido",
      cost_eur:      0,
      charged_eur:   0,
      metadata:      { invalid_recipient: true, ...args.metadata },
    });
  }

  if (recipients.length > 0) {
    const suppressed = await getSuppressedEmailMap(admin, recipients, args.companyId, args.stream);
    if (suppressed.size > 0) {
      const sendable: string[] = [];
      for (const r of recipients) {
        const hit = suppressed.get(normalizeEmailAddress(r));
        if (!hit) {
          sendable.push(r);
          continue;
        }
        await logEmailDelivery(admin, {
          company_id:    args.companyId,
          recipient:     r,
          subject:       args.subject,
          template_name: args.templateName,
          status:        "failed",
          provider:      settings.provider,
          stream:        args.stream,
          campaign_id:   args.campaignId ?? null,
          error_message: `Destinatario in suppression list (${hit.reason})`,
          cost_eur:      0,
          charged_eur:   0,
          metadata: {
            suppressed: true,
            suppression_reason: hit.reason,
            suppression_company_id: hit.companyId,
            ...args.metadata,
          },
        });
      }
      recipients = sendable;
    }
  }

  if (recipients.length === 0) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Nessun destinatario inviabile",
        invalid: normalized.invalid.length,
      },
    };
  }

  const recipientCount = recipients.length;

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
      // Una riga nel log non la legge nessuno: dal lato azienda il preventivo
      // risulta inviato e il cliente non riceve niente. Chi amministra
      // l'azienda riceve un avviso (uno al giorno, non uno per email respinta).
      await admin.rpc("avvisa_crediti_email_esauriti", {
        p_company_id: args.companyId,
        p_dettaglio: args.templateName ?? args.stream,
      }).then(
        () => {},
        (e: unknown) => console.warn("[sendEmailUnified] avviso crediti fallito:", e),
      );
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

  // ── 3b. Resolve custom sender domain ─────────────────────────────────────
  // Priority: `senderOverride` (when passed by `send-transactional-v2` etc.)
  // → verified + active row in `company_email_domains` (Sprint 7 single-domain)
  // → platform default from provider settings.
  let fromAddress = settings.fromDefault;
  let customDomain: string | null = null;
  let providerDomain: string | null = null;
  let customDomainId: string | null = null;
  let senderSource = "platform_default";
  let effectiveReplyTo = args.replyTo;
  let usingCustomDomain = false;

  if (args.senderOverride) {
    fromAddress        = args.senderOverride.from;
    customDomain       = args.senderOverride.customDomain ?? null;
    providerDomain     = args.senderOverride.customDomain ?? null;
    customDomainId     = args.senderOverride.customDomainId ?? null;
    usingCustomDomain  = Boolean(args.senderOverride.usingCustomDomain);
    senderSource       = args.senderOverride.source ?? "override";
    effectiveReplyTo   = args.senderOverride.replyTo ?? effectiveReplyTo;
  } else if (args.companyId && !args.platformSender) {
    try {
      const resolved = await resolveSender(args.companyId, args.stream, admin);
      fromAddress = resolved.from;
      providerDomain = resolved.domain;
      customDomain = resolved.usingCustomDomain ? resolved.domain : null;
      customDomainId = resolved.customDomainId ?? null;
      usingCustomDomain = resolved.usingCustomDomain;
      senderSource = resolved.source;
      effectiveReplyTo = effectiveReplyTo ?? resolved.replyTo;
    } catch {
      /* best-effort: fall back to platform default */
    }
  }

  // ── 4. Send via provider ─────────────────────────────────────────────────
  const providerHeaders: Record<string, string> = {
    ...(args.headers ?? {}),
    "X-EIC-Stream": args.stream,
  };
  if (args.companyId) providerHeaders["X-EIC-Company-ID"] = args.companyId;
  if (args.templateName) providerHeaders["X-EIC-Template"] = args.templateName;
  const unsubscribeUrl = args.metadata?.unsubscribe_url;
  if (
    args.stream === "marketing" &&
    typeof unsubscribeUrl === "string" &&
    unsubscribeUrl.startsWith("http") &&
    !providerHeaders["List-Unsubscribe"]
  ) {
    providerHeaders["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    providerHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  let result: EmailSendResult;
  let refundedAfterProviderFailure = false;
  async function refundFailedSend(reason: string): Promise<boolean> {
    if (!shouldCharge || chargedTotal <= 0 || !args.companyId) return false;
    try {
      await addEmailCredits(args.companyId, chargedTotal, "refund", {
        description: `Rimborso invio email fallito: ${args.stream}:${args.templateName ?? "unknown"}`,
        metadata: {
          provider_failure: true,
          reason,
          recipients: recipientCount,
          stream: args.stream,
          template_name: args.templateName ?? null,
          ...args.metadata,
        },
        adminClient: admin,
      });
      return true;
    } catch (refundErr) {
      console.error("[sendEmailUnified] refund after provider failure failed:", refundErr);
      return false;
    }
  }

  try {
    if (args.mailboxOverride) {
      // Invio via SMTP per-casella (Outreach cold mailbox provider='smtp').
      result = await sendViaProvider("smtp", "", {
        from: fromAddress, to: recipients, subject: args.subject, html: args.html, text: args.text,
        replyTo: effectiveReplyTo, attachments: args.attachments, headers: providerHeaders,
      }, { smtp: args.mailboxOverride, stream: args.stream });
    } else {
      result = await sendViaProviderWithFailover(streamProvider, settings, {
        from:    fromAddress,
        to:      recipients,
        subject: args.subject,
        html:    args.html,
        text:    args.text,
        replyTo: effectiveReplyTo,
        attachments: args.attachments,
        headers: providerHeaders,
      }, {
        domain: providerDomain ?? customDomain ?? settings.domain ?? undefined,
        stream: streamProvider,
        disableNativeTracking: args.stream === "marketing" || args.viaMarketingProvider === true,
        elasticTransactionalClass: args.viaMarketingProvider === true ? true : undefined,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    refundedAfterProviderFailure = await refundFailedSend(msg);
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
        charged_eur:   shouldCharge && !refundedAfterProviderFailure ? pricePerEmail : 0,
        metadata: {
          provider_exception: true,
          refunded_after_provider_failure: refundedAfterProviderFailure,
          sender_source:       senderSource,
          custom_domain_id:    customDomainId,
          using_custom_domain: usingCustomDomain,
          ...args.metadata,
        },
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
      chargedEur: refundedAfterProviderFailure ? 0 : chargedTotal,
    };
  }

  if (!result.ok) {
    const providerFailureReason = typeof result.body === "object"
      ? JSON.stringify(result.body)
      : String(result.body ?? `HTTP ${result.status}`);
    refundedAfterProviderFailure = await refundFailedSend(providerFailureReason);
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
      provider:      result.providerUsed ?? settings.provider,
      stream:        args.stream,
      campaign_id:   args.campaignId ?? null,
      provider_id:   result.providerMessageId ?? null,
      error_message: providerError,
      cost_eur:      0,
      charged_eur:   result.ok && shouldCharge
        ? pricePerEmail
        : !result.ok && shouldCharge && !refundedAfterProviderFailure
          ? pricePerEmail
          : 0,
      metadata: {
        over_quota: overQuota,
        is_free: isFree,
        refunded_after_provider_failure: !result.ok ? refundedAfterProviderFailure : false,
        template_name: args.templateName ?? null,
        custom_domain: customDomain,
        custom_domain_id: customDomainId,
        using_custom_domain: usingCustomDomain,
        sender_source: senderSource,
        from_address: fromAddress,
        ...args.metadata,
      },
    });
    if (id) lastLogId = id;
  }

  return {
    ...result,
    deliveryLogId: lastLogId,
    creditsBefore,
    creditsAfter: refundedAfterProviderFailure ? creditsBefore : creditsAfter,
    chargedEur: result.ok ? chargedTotal : refundedAfterProviderFailure ? 0 : chargedTotal,
    overQuota,
    isFree,
    effectiveLimit,
    sentThisMonth,
  };
}
