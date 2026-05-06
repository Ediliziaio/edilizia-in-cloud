import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProviderWithFailover, loadProviderSettings, sanitizeFromName } from "../_shared/emailProvider.ts";
import { addEmailCredits, deductEmailCredits } from "../_shared/emailCredits.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { logEmailDelivery } from "../_shared/email-log.ts";
import { resolveSender } from "../_shared/resolveSender.ts";
import {
  getSuppressedEmailMap,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "../_shared/emailSuppression.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

function parseJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dedupeContactsByEmail<T extends { email?: string | null }>(contacts: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const contact of contacts) {
    if (!isValidEmailAddress(contact.email)) continue;
    const email = normalizeEmailAddress(contact.email);
    if (seen.has(email)) continue;
    seen.add(email);
    deduped.push({ ...contact, email });
  }
  return deduped;
}

async function fetchCampaignContacts(
  adminClient: any,
  companyId: string,
  segmentJson: unknown,
  recipientFilter: unknown,
): Promise<{ contacts: any[]; error: { message: string } | null }> {
  const PAGE_SIZE = 1000;
  const contacts: any[] = [];
  const seg = parseJsonObject(segmentJson);
  const filter = parseJsonObject(recipientFilter);

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = adminClient
      .from("marketing_contacts")
      .select("id, email, first_name, last_name, phone, city, province, company_name")
      .eq("company_id", companyId)
      .eq("email_unsubscribed", false)
      .not("email", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (seg.tags?.length) query = query.overlaps("tags", seg.tags);
    if (seg.source) query = query.eq("source", seg.source);
    if (seg.contact_type) query = query.eq("contact_type", seg.contact_type);
    if (filter.tags?.length) query = query.overlaps("tags", filter.tags);

    const { data, error } = await query;
    if (error) return { contacts, error };
    contacts.push(...((data ?? []) as any[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return { contacts, error: null };
}

async function claimCampaignOutboxJob(
  adminClient: any,
  job: {
    companyId: string;
    campaignId: string;
    contactId: string;
    recipient: string;
    subject: string;
    html: string;
    fromAddress: string;
    providerDomain: string | null;
    headers: Record<string, string>;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<{ id: string | null; shouldSend: boolean; attempts: number; maxAttempts: number }> {
  const { data: existing } = await adminClient
    .from("email_outbox")
    .select("id, status, attempts, max_attempts, lease_until")
    .eq("idempotency_key", job.idempotencyKey)
    .maybeSingle();

  if (existing?.status === "sent") {
    return { id: existing.id, shouldSend: false, attempts: existing.attempts ?? 0, maxAttempts: existing.max_attempts ?? 5 };
  }

  const nextAttempts = Number(existing?.attempts ?? 0) + 1;
  const leaseUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const payload = {
    company_id: job.companyId,
    stream: "marketing",
    campaign_id: job.campaignId,
    contact_id: job.contactId,
    recipient: job.recipient,
    subject: job.subject,
    html: job.html,
    template_name: "campaign_send",
    sender_from: job.fromAddress,
    provider_domain: job.providerDomain,
    headers: job.headers,
    metadata: job.metadata,
    status: "processing",
    attempts: nextAttempts,
    max_attempts: Number(existing?.max_attempts ?? 5),
    lease_until: leaseUntil,
    locked_by: "send-email-campaign",
    scheduled_at: new Date().toISOString(),
    idempotency_key: job.idempotencyKey,
  };

  if (!existing?.id) {
    const { data, error } = await adminClient
      .from("email_outbox")
      .insert(payload)
      .select("id, attempts, max_attempts")
      .single();
    if (error) {
      console.error("[send-email-campaign] email_outbox insert error:", error);
      return { id: null, shouldSend: true, attempts: nextAttempts, maxAttempts: 5 };
    }
    return { id: data.id, shouldSend: true, attempts: data.attempts ?? nextAttempts, maxAttempts: data.max_attempts ?? 5 };
  }

  const { data, error } = await adminClient
    .from("email_outbox")
    .update(payload)
    .eq("id", existing.id)
    .neq("status", "sent")
    .select("id, attempts, max_attempts")
    .maybeSingle();
  if (error) {
    console.error("[send-email-campaign] email_outbox claim error:", error);
  }
  return {
    id: data?.id ?? existing.id,
    shouldSend: true,
    attempts: data?.attempts ?? nextAttempts,
    maxAttempts: data?.max_attempts ?? Number(existing?.max_attempts ?? 5),
  };
}

async function finishCampaignOutboxJob(
  adminClient: any,
  job: {
    id: string | null;
    ok: boolean;
    provider: string;
    providerMessageId?: string | null;
    errorMessage?: string | null;
    attempts: number;
    maxAttempts: number;
    companyId: string;
    campaignId: string;
    recipient: string;
    subject: string;
    metadata: Record<string, unknown>;
  },
) {
  if (!job.id) return;
  const dead = !job.ok && job.attempts >= job.maxAttempts;
  await adminClient
    .from("email_outbox")
    .update({
      status: job.ok ? "sent" : dead ? "dead" : "failed",
      provider: job.provider,
      provider_message_id: job.providerMessageId ?? null,
      last_error: job.errorMessage ?? null,
      lease_until: null,
      locked_by: null,
      sent_at: job.ok ? new Date().toISOString() : null,
    })
    .eq("id", job.id);

  if (dead) {
    await adminClient.from("email_dead_letter").insert({
      outbox_id: job.id,
      company_id: job.companyId,
      stream: "marketing",
      campaign_id: job.campaignId,
      recipient: job.recipient,
      subject: job.subject,
      attempts: job.attempts,
      last_error: job.errorMessage ?? "Provider failure",
      payload: job.metadata,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRoleCall = authHeader === `Bearer ${serviceRoleKey}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = isServiceRoleCall
      ? { data: { user: null }, error: null }
      : await supabase.auth.getUser();
    if (!isServiceRoleCall && (userError || !user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { campaignId } = body;

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "Parametro mancante: campaignId" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch campaign
    const { data: campaign, error: campError } = await adminClient
      .from("email_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campagna non trovata" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Verify caller belongs to the campaign's company (or is super_admin)
    const { data: callerRoles } = isServiceRoleCall
      ? { data: [] }
      : await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user!.id);
    const isSuperAdmin = (callerRoles || []).some((r: any) => r.role === "super_admin");

    if (!isServiceRoleCall && !isSuperAdmin) {
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .maybeSingle();

      if (!callerProfile || callerProfile.company_id !== campaign.company_id) {
        return new Response(
          JSON.stringify({ error: "Non autorizzato: accesso negato a questa campagna" }),
          { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    if (campaign.status === "sent" || (campaign.status === "sending" && !isServiceRoleCall)) {
      return new Response(
        JSON.stringify({ error: "Campagna già inviata o in fase di invio" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const companyId = campaign.company_id;

    // Mark campaign as sending with optimistic locking. This blocks duplicate
    // browser submits while still allowing cron/service-role resume from sending.
    const { data: sendingLock, error: sendingLockError } = await adminClient
      .from("email_campaigns")
      .update({ status: "sending", sent_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("status", campaign.status)
      .select("id")
      .maybeSingle();
    if (sendingLockError) {
      return new Response(
        JSON.stringify({ error: "Impossibile bloccare la campagna: " + sendingLockError.message }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    if (!sendingLock) {
      return new Response(
        JSON.stringify({ error: "Campagna già presa in carico da un altro processo" }),
        { status: 409, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Load provider settings
    const settings = await loadProviderSettings("marketing");
    if (!settings.apiKey) {
      await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "API Key del provider email marketing non configurata" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { contacts, error: contactsError } = await fetchCampaignContacts(
      adminClient,
      companyId,
      campaign.segment_json,
      campaign.recipient_filter,
    );
    if (contactsError) {
      await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "Errore nel recupero dei contatti: " + contactsError.message }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const rawRecipients = dedupeContactsByEmail(contacts);
    const suppressedEmails = await getSuppressedEmailMap(
      adminClient,
      rawRecipients.map((c: any) => c.email),
      companyId,
      "marketing",
    );
    let recipients = rawRecipients.filter((c: any) => !suppressedEmails.has(normalizeEmailAddress(c.email)));

    // Idempotenza best-effort: se una funzione viene ritentata dopo timeout,
    // non reinvia ai contatti già loggati come consegnati per la stessa campagna.
    const { data: previousSuccessfulLogs } = await adminClient
      .from("email_logs")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .in("status", ["delivered", "sent", "opened", "clicked"]);
    const alreadySentContactIds = new Set(
      ((previousSuccessfulLogs ?? []) as Array<{ contact_id: string }>).map((row) => row.contact_id),
    );
    const alreadySentCount = alreadySentContactIds.size;
    recipients = recipients.filter((c: any) => !alreadySentContactIds.has(c.id));

    if (recipients.length === 0 && alreadySentCount === 0) {
      await adminClient.from("email_campaigns").update({
        status: "failed",
        failed_count: 0,
        sent_count: 0,
        total_recipients: rawRecipients.length,
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "Nessun destinatario trovato", sent: 0 }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (recipients.length === 0 && alreadySentCount > 0) {
      await adminClient.from("email_campaigns").update({
        status: "sent",
        sent_count: alreadySentCount,
        failed_count: 0,
        total_recipients: alreadySentCount,
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ success: true, sent: alreadySentCount, failed: 0, total: alreadySentCount, resumed: true }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Check billing overrides for email service
    const billingConfig = await getCompanyBillingConfig(adminClient, companyId, "email");

    if (!billingConfig.isEnabled) {
      await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "Servizio email disabilitato per questa azienda" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Deduct credits upfront (skip if service is free)
    const emailUnitCost = billingConfig.pricePerUnitEur || 1; // 1 credit = 1 email (default)
    const emailCost = recipients.length * emailUnitCost;

    if (!billingConfig.isFree) {
      try {
        await deductEmailCredits(companyId, emailCost, {
          description: `Campagna: ${campaign.name}`,
          campaignId,
          adminClient,
        });
      } catch (creditError: any) {
        await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
        return new Response(
          JSON.stringify({ error: "Crediti insufficienti: " + creditError.message }),
          { status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    // Build from address — priority chain:
    //   1. campaign.sender_email (explicit override set on the campaign itself)
    //   2. company_email_preferences + resolveSender (dominio marketing scelto)
    //   3. settings.fromDefault (platform default)
    let customDomainForCampaign: string | null = null;
    let providerDomainForCampaign: string | null = null;
    let fromAddress: string;
    if (campaign.sender_email) {
      const safeSenderName = sanitizeFromName(campaign.sender_name);
      fromAddress = safeSenderName
        ? `${safeSenderName} <${campaign.sender_email}>`
        : campaign.sender_email;
      providerDomainForCampaign = campaign.sender_email.includes("@")
        ? campaign.sender_email.split("@").pop() ?? null
        : null;
    } else {
      try {
        const sender = await resolveSender(companyId, "marketing", adminClient);
        fromAddress = sender.from;
        providerDomainForCampaign = sender.domain;
        if (sender.usingCustomDomain) {
          customDomainForCampaign = sender.domain;
        }
      } catch {
        fromAddress = settings.fromDefault;
        providerDomainForCampaign = settings.domain ?? null;
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    let sentCount = alreadySentCount;
    let failedCount = 0;

    // A/B Testing: split recipients
    const isAbTest = campaign.ab_test_enabled && campaign.ab_subject_b;
    const abSplitPercent = Math.max(10, Math.min(90, campaign.ab_split_percent ?? 50));

    let recipientsA: any[] = recipients;
    let recipientsB: any[] = [];

    if (isAbTest) {
      // Fisher-Yates shuffle for uniform distribution
      const shuffled = [...recipients];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const splitIdx = Math.round(shuffled.length * (abSplitPercent / 100));
      recipientsA = shuffled.slice(0, splitIdx);
      recipientsB = shuffled.slice(splitIdx);
    }

    // Send emails in parallel batches (BUG-08: was 5, increased to avoid timeout on large lists)
    const BATCH_SIZE = Math.max(1, Math.min(Number(Deno.env.get("EMAIL_MARKETING_BATCH_SIZE") || 50), 100));

    async function sendToContact(contact: any, abVariant?: string) {
      let claimedOutbox: { id: string | null; attempts: number; maxAttempts: number } | null = null;
      try {
        // Determine subject based on variant
        const emailSubject = abVariant === "B" && campaign.ab_subject_b
          ? campaign.ab_subject_b
          : campaign.subject || "Senza oggetto";

        // Determine HTML content based on variant
        let html = abVariant === "B" && campaign.ab_html_content_b
          ? campaign.ab_html_content_b
          : campaign.html_content || "<p>Nessun contenuto</p>";

        // Personalize HTML — support both {{var}} and {{contact.var}} formats (GAP-14)
        html = html
          .replace(/\{\{first_name\}\}/g, contact.first_name || "")
          .replace(/\{\{last_name\}\}/g, contact.last_name || "")
          .replace(/\{\{email\}\}/g, contact.email || "")
          .replace(/\{\{contact\.first_name\}\}/g, contact.first_name || "")
          .replace(/\{\{contact\.last_name\}\}/g, contact.last_name || "")
          .replace(/\{\{contact\.email\}\}/g, contact.email || "")
          .replace(/\{\{phone\}\}/g, contact.phone || "")
          .replace(/\{\{city\}\}/g, contact.city || "")
          .replace(/\{\{province\}\}/g, contact.province || "")
          .replace(/\{\{contact_company\}\}/g, contact.company_name || "");

        // Inject UTM parameters before click-tracking wraps links (BUG-07)
        if (campaign.utm_tracking) {
          const utmParams = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign.name || "")}`;
          html = html.replace(/href="(https?:\/\/[^"]+)"/g, (_m: string, linkUrl: string) => {
            const sep = linkUrl.includes("?") ? "&" : "?";
            return `href="${linkUrl}${sep}${utmParams}"`;
          });
        }

        // Add tracking pixel
        const trackingPixelUrl = `${supabaseUrl}/functions/v1/email-tracking?type=open&cid=${campaignId}&rid=${contact.id}&co=${companyId}`;
        html += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

        // Wrap links for click tracking
        html = html.replace(
          /href="(https?:\/\/[^"]+)"/g,
          (_match: string, url: string) => {
            const trackUrl = `${supabaseUrl}/functions/v1/email-tracking?type=click&cid=${campaignId}&rid=${contact.id}&co=${companyId}&url=${encodeURIComponent(url)}`;
            return `href="${trackUrl}"`;
          }
        );

        // Add unsubscribe link
        const unsubUrl = `${supabaseUrl}/functions/v1/email-tracking?type=unsub&cid=${campaignId}&rid=${contact.id}&co=${companyId}`;
        // Replace {{unsubscribe_url}} placeholder in HTML (BUG-09) — done after click-tracking
        // so the unsub link goes directly to the unsub endpoint, not through the click tracker
        html = html.replace(/\{\{unsubscribe_url\}\}/g, unsubUrl);
        const unsubHeader = `<${unsubUrl}>`;
        const headers = {
          "List-Unsubscribe": unsubHeader,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        };
        const outbox = await claimCampaignOutboxJob(adminClient, {
          companyId,
          campaignId,
          contactId: contact.id,
          recipient: contact.email,
          subject: emailSubject,
          html,
          fromAddress,
          providerDomain: providerDomainForCampaign ?? customDomainForCampaign ?? settings.domain ?? null,
          headers,
          metadata: { ab_variant: abVariant ?? null, contact_id: contact.id },
          idempotencyKey: `campaign:${campaignId}:contact:${contact.id}:variant:${abVariant ?? "A"}`,
        });
        claimedOutbox = outbox;
        if (!outbox.shouldSend) {
          return true;
        }

        const result = await sendViaProviderWithFailover("marketing", settings, {
          from: fromAddress,
          to: [contact.email],
          subject: emailSubject,
          html,
          headers,
        }, {
          domain: providerDomainForCampaign ?? customDomainForCampaign ?? settings.domain,
          stream: "marketing",
          disableNativeTracking: true,
        });
        const providerUsed = result.providerUsed ?? settings.provider;
        const providerError = result.ok ? null : JSON.stringify(result.body);

        await finishCampaignOutboxJob(adminClient, {
          id: outbox.id,
          ok: result.ok,
          provider: providerUsed,
          providerMessageId: result.providerMessageId ?? null,
          errorMessage: providerError,
          attempts: outbox.attempts,
          maxAttempts: outbox.maxAttempts,
          companyId,
          campaignId,
          recipient: contact.email,
          subject: emailSubject,
          metadata: { ab_variant: abVariant ?? null, contact_id: contact.id },
        });

        // Log the send with A/B variant (email_logs tracks campaign open/click)
        await adminClient.from("email_logs").insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          company_id: companyId,
          status: result.ok ? "delivered" : "failed",
          provider: providerUsed,
          provider_message_id: result.providerMessageId || null,
          stream: "marketing",
          event_timestamp: new Date().toISOString(),
          error_message: providerError,
          ...(abVariant ? { ab_variant: abVariant } : {}),
        });

        // Also mirror into the unified email_delivery_log for SuperAdmin
        // dashboards, audit trail and P&L reporting.
        await logEmailDelivery(adminClient, {
          company_id: companyId,
          recipient: contact.email,
          subject: emailSubject,
          template_name: "campaign_send",
          status: result.ok ? "sent" : "failed",
          provider: providerUsed,
          stream: "marketing",
          campaign_id: campaignId,
          provider_id: result.providerMessageId ?? null,
          error_message: providerError,
          cost_eur: 0,
          charged_eur: 0,
          metadata: { ab_variant: abVariant ?? null, contact_id: contact.id },
        });

        return result.ok;
      } catch (err: any) {
        await adminClient.from("email_logs").insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          company_id: companyId,
          status: "failed",
          provider: settings.provider,
          stream: "marketing",
          event_timestamp: new Date().toISOString(),
          error_message: err.message,
          ...(abVariant ? { ab_variant: abVariant } : {}),
        });
        const fallbackSubject = abVariant === "B" && campaign.ab_subject_b ? campaign.ab_subject_b : campaign.subject || "Senza oggetto";
        if (claimedOutbox?.id) {
          await finishCampaignOutboxJob(adminClient, {
            id: claimedOutbox.id,
            ok: false,
            provider: settings.provider,
            errorMessage: err.message,
            attempts: claimedOutbox.attempts,
            maxAttempts: claimedOutbox.maxAttempts,
            companyId,
            campaignId,
            recipient: contact.email,
            subject: fallbackSubject,
            metadata: { ab_variant: abVariant ?? null, contact_id: contact.id, provider_exception: true },
          });
        }
        await logEmailDelivery(adminClient, {
          company_id: companyId,
          recipient: contact.email,
          subject: fallbackSubject,
          template_name: "campaign_send",
          status: "failed",
          provider: settings.provider,
          stream: "marketing",
          campaign_id: campaignId,
          error_message: err.message,
          cost_eur: 0,
          charged_eur: 0,
          metadata: { ab_variant: abVariant ?? null, contact_id: contact.id, provider_exception: true },
        });
        return false;
      }
    }

    // Send variant A
    for (let i = 0; i < recipientsA.length; i += BATCH_SIZE) {
      const batch = recipientsA.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((c) => sendToContact(c, isAbTest ? "A" : undefined)));
      for (const ok of results) {
        if (ok) sentCount++;
        else failedCount++;
      }
    }

    // Send variant B
    for (let i = 0; i < recipientsB.length; i += BATCH_SIZE) {
      const batch = recipientsB.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((c) => sendToContact(c, "B")));
      for (const ok of results) {
        if (ok) sentCount++;
        else failedCount++;
      }
    }

    const failedRefund = !billingConfig.isFree && failedCount > 0
      ? failedCount * emailUnitCost
      : 0;
    let refundedFailedCost = 0;
    if (failedRefund > 0) {
      await addEmailCredits(companyId, failedRefund, "refund", {
        description: `Rimborso invii falliti campagna: ${campaign.name}`,
        metadata: { campaign_id: campaignId, failed_recipients: failedCount, stream: "marketing" },
        adminClient,
      }).then(() => {
        refundedFailedCost = failedRefund;
      }).catch((refundErr) => {
        console.error("[send-email-campaign] failed-send refund error:", refundErr);
      });
    }

    // Update campaign status
    await adminClient
      .from("email_campaigns")
      .update({
        status: failedCount === recipients.length && alreadySentCount === 0 ? "failed" : "sent",
        sent_count: sentCount,
        failed_count: failedCount,
        credits_used: Math.max(0, emailCost - refundedFailedCost),
        completed_at: new Date().toISOString(),
        total_recipients: recipients.length + alreadySentCount,
      })
      .eq("id", campaignId);

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount, total: recipients.length + alreadySentCount }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
