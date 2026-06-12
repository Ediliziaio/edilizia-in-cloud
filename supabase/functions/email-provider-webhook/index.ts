import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as baseCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import {
  decideSuppression,
  normalizeEvents as normalizeEventsShared,
} from "../_shared/webhookNormalizers.ts";
import {
  timingSafeEqual,
  verifyMailgunWebhookSignature,
  verifySvixWebhookSignature,
} from "../_shared/webhookSecurity.ts";

const corsHeaders = {
  ...baseCorsHeaders,
};

// P2-3: timingSafeEqual locale rimosso. Usiamo la versione shared in
// _shared/webhookSecurity.ts (stessa implementazione XOR a lunghezza
// costante, ora riusabile da altre edge function).

/**
 * Normalizes webhook events from different email providers into a common format.
 * Supports: SendGrid, Brevo, Elastic Email, Mailgun, Resend
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept GET for Mailgun verification
  if (req.method === "GET") {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Verifica token segreto webhook (SEC-012 + P1-6).
  // Preferiamo header `x-webhook-secret`. Per compatibilita' operativa con
  // provider che accettano solo URL webhook manteniamo anche `?secret=...`.
  // Il valore non viene mai loggato e il confronto resta timing-safe.
  const webhookSecret =
    Deno.env.get("WEBHOOK_SECRET") ||
    await getPlatformSetting("email_provider_webhook_secret");
  if (!webhookSecret) {
    return new Response(
      JSON.stringify({ error: "WEBHOOK_SECRET not configured — endpoint disabled for security" }),
      { status: 503, headers: corsHeaders }
    );
  }
  const providedSecret = req.headers.get("x-webhook-secret") || url.searchParams.get("secret");
  if (!providedSecret || !timingSafeEqual(providedSecret, webhookSecret)) {
    console.error("email-provider-webhook: token segreto non valido");
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const stream = url.searchParams.get("stream") || "marketing";
    const rawBodyText = await req.clone().text().catch(() => "");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    let rawBody: any;

    if (contentType.includes("application/json")) {
      rawBody = await req.json();
    } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      rawBody = Object.fromEntries(formData.entries());
    } else {
      rawBody = await req.json().catch(() => null);
    }

    if (!rawBody) {
      return new Response("No body", { status: 400, headers: corsHeaders });
    }

    // Provider-native signatures, when configured. The generic
    // x-webhook-secret above remains a required coarse gate; native signatures
    // add payload integrity for providers that support it without breaking
    // existing provider setup that hasn't enabled native signing yet.
    const mailgunSigningKey =
      Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY") ||
      await getPlatformSetting("email_mailgun_webhook_signing_key");
    const mailgunSignature = req.headers.get("x-mailgun-signature") ||
      rawBody?.signature?.signature ||
      rawBody?.signature;
    const mailgunTimestamp = req.headers.get("x-mailgun-timestamp") ||
      rawBody?.signature?.timestamp ||
      rawBody?.timestamp;
    const mailgunToken = req.headers.get("x-mailgun-token") ||
      rawBody?.signature?.token ||
      rawBody?.token;
    if (mailgunSigningKey && (mailgunSignature || mailgunTimestamp || mailgunToken)) {
      const ok = await verifyMailgunWebhookSignature(
        mailgunTimestamp ? String(mailgunTimestamp) : null,
        mailgunToken ? String(mailgunToken) : null,
        mailgunSignature ? String(mailgunSignature) : null,
        mailgunSigningKey,
      );
      if (!ok) {
        return new Response("Invalid Mailgun signature", { status: 401, headers: corsHeaders });
      }
    }

    const resendWebhookSecret =
      Deno.env.get("RESEND_WEBHOOK_SECRET") ||
      await getPlatformSetting("email_resend_webhook_secret");
    const svixSignature = req.headers.get("svix-signature");
    if (resendWebhookSecret && svixSignature) {
      const ok = await verifySvixWebhookSignature(
        rawBodyText,
        req.headers.get("svix-id"),
        req.headers.get("svix-timestamp"),
        svixSignature,
        resendWebhookSecret,
      );
      if (!ok) {
        return new Response("Invalid Resend signature", { status: 401, headers: corsHeaders });
      }
    }

    // Normalize events (shared pure module, unit-tested)
    const events = normalizeEventsShared(rawBody, stream);

    // Process each event
    for (const event of events) {
      const now = new Date().toISOString();

      // Track the owning company + stream for the event (derived from
      // email_delivery_log). Used below to scope the suppression row per-company
      // when the event is an unsubscribe.
      let deliveryCompanyId: string | null = null;
      let deliveryStream: string | null = null;

      if (event.providerMessageId) {
        // Find the email_log by provider_message_id (legacy marketing table)
        const { data: log } = await adminClient
          .from("email_logs")
          .select("id, status, company_id, stream")
          .eq("provider_message_id", event.providerMessageId)
          .limit(1)
          .maybeSingle();

        if (log) {
          deliveryCompanyId = (log.company_id as string | null) ?? deliveryCompanyId;
          deliveryStream = (log.stream as string | null) ?? deliveryStream;
          const updates: Record<string, any> = {};

          switch (event.type) {
            case "delivered":
              updates.status = "delivered";
              break;
            case "opened":
              updates.opened_at = now;
              break;
            case "clicked":
              updates.clicked_at = now;
              if (!log.status || log.status !== "delivered") updates.status = "delivered";
              break;
            case "bounced":
              updates.status = "bounced";
              updates.error_message = event.reason || "Bounced";
              break;
            case "spam":
              updates.status = "spam";
              break;
            case "unsubscribed":
              updates.status = "unsubscribed";
              break;
            case "dropped":
            case "deferred":
              updates.status = event.type;
              updates.error_message = event.reason || null;
              break;
          }

          if (Object.keys(updates).length > 0) {
            await adminClient
              .from("email_logs")
              .update(updates)
              .eq("id", log.id);
          }
        }

        // Mirror status updates on the unified email_delivery_log so the
        // SuperAdmin dashboard, audit log and P&L all reflect provider events
        // for transactional sends (which don't live in email_logs).
        // Also fetches company_id + stream so we can scope suppressions below.
        const { data: deliveryRows } = await adminClient
          .from("email_delivery_log")
          .select("id, company_id, stream")
          .eq("provider_id", event.providerMessageId)
          .limit(1);

        if (deliveryRows && deliveryRows.length > 0) {
          deliveryCompanyId = (deliveryRows[0].company_id as string | null) ?? null;
          deliveryStream = (deliveryRows[0].stream as string | null) ?? null;
        }

        const deliveryUpdate: Record<string, unknown> = {};
        switch (event.type) {
          case "delivered":
            deliveryUpdate.status = "delivered";
            break;
          case "opened":
            deliveryUpdate.opened_at = now;
            break;
          case "clicked":
            deliveryUpdate.clicked_at = now;
            break;
          case "bounced":
            deliveryUpdate.status = "bounced";
            if (event.reason) deliveryUpdate.error_message = event.reason;
            break;
          case "spam":
            deliveryUpdate.status = "spam";
            break;
          case "dropped":
          case "deferred":
            deliveryUpdate.status = event.type;
            if (event.reason) deliveryUpdate.error_message = event.reason;
            break;
          case "unsubscribed":
            deliveryUpdate.status = "unsubscribed";
            break;
        }
        if (Object.keys(deliveryUpdate).length > 0) {
          await adminClient
            .from("email_delivery_log")
            .update(deliveryUpdate)
            .eq("provider_id", event.providerMessageId);
        }
      }

      // ── Suppression upsert (dual-provider spec) ─────────────────────────
      // hard_bounce  → GLOBAL suppression (invalid address, blocks every send)
      // spam_complaint → GLOBAL suppression (user flagged as spam)
      // unsubscribe → PER-COMPANY suppression (only blocks marketing from that
      //               company; transactional keeps working — e.g. password reset)
      //
      // Reason values and UNIQUE NULLS NOT DISTINCT constraint are enforced by
      // migration 20260422000003_email_suppressions_company_scope.sql.
      if (event.email) {
        const suppression = decideSuppression(event, deliveryCompanyId);
        const supReason = suppression.reason;
        const supCompanyId = suppression.companyIdScope;

        if (suppression.shouldSuppress && supReason) {
          const suppressionRow: Record<string, unknown> = {
            email: event.email,
            company_id: supCompanyId,
            reason: supReason,
            suppressed_at: now,
            source_provider: event.provider ?? null,
            source_event_id: event.providerMessageId ?? null,
            metadata: {
              stream: deliveryStream ?? stream,
              isHardBounce: event.isHardBounce ?? null,
              reason_raw: event.reason ?? null,
            },
          };
          const { error: supErr } = await adminClient
            .from("email_suppressions")
            .upsert(suppressionRow, {
              onConflict: "company_id,email_normalized,reason",
              ignoreDuplicates: true,
            });
          if (supErr) {
            console.error("[email-provider-webhook] suppression upsert error:", supErr);
          }

          if (supReason === "unsubscribe" && supCompanyId) {
            // optout_email = colonna reale per l'opt-out del canale email
            // (la vecchia email_unsubscribed non esiste e falliva in silenzio)
            await adminClient
              .from("marketing_contacts")
              .update({ optout_email: true })
              .eq("company_id", supCompanyId)
              .eq("email", event.email);
          }

          // BUG-03: mantieni marketing_contacts sync per hard bounce / spam
          // (evita di rimandare la newsletter a indirizzi chiaramente cattivi).
          if (supReason === "hard_bounce" || supReason === "spam_complaint") {
            await adminClient
              .from("marketing_contacts")
              .update({ optout_email: true })
              .eq("email", event.email);
          }
        } else if (event.type === "unsubscribed" && !deliveryCompanyId) {
          console.warn(
            "[email-provider-webhook] unsubscribe senza company_id: suppression ignorata per evitare opt-out globale cross-tenant",
          );
        }
      }

      // S0.6: su HARD bounce rifondi il credito email al wallet dell'azienda.
      // Chiama refund_email_credit_on_bounce, che è idempotente: se il
      // message_id è già stato rifondato NON viene emesso un nuovo refund.
      // Per evitare refund su soft bounce (temporanei, il provider riproverà),
      // rifondiamo SOLO se il provider dichiara hard bounce esplicitamente.
      if (
        event.type === "bounced" &&
        event.isHardBounce === true &&
        event.providerMessageId
      ) {
        try {
          const { data: refundResult, error: refundErr } = await adminClient.rpc(
            "refund_email_credit_on_bounce",
            {
              p_provider_message_id: event.providerMessageId,
              p_reason: event.reason || "hard_bounce",
            },
          );
          if (refundErr) {
            console.error("[email-provider-webhook] refund error:", refundErr);
          } else {
            console.info("[email-provider-webhook] refund result:", refundResult);
          }
        } catch (refundCatch) {
          console.error("[email-provider-webhook] refund threw:", refundCatch);
        }
      }
    }

    return new Response(JSON.stringify({ processed: events.length }), {
      status: 200,
      headers: { ...corsHeaders, ...secureHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("email-provider-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, ...secureHeaders, "Content-Type": "application/json" },
    });
  }
});

// Tipi e logica di normalizzazione spostati in _shared/webhookNormalizers.ts
// (pure TS, zero dipendenze Deno/esm.sh) per poter essere unit-testati via
// vitest da src/test/logic/webhookNormalizers.test.ts.
