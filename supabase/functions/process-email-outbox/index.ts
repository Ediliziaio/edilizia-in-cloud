// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProviderWithFailover } from "../_shared/emailProvider.ts";
import { logEmailDelivery } from "../_shared/email-log.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getSuppressedEmailMap, normalizeEmailAddress } from "../_shared/emailSuppression.ts";

interface OutboxJob {
  id: string;
  company_id: string | null;
  stream: "marketing" | "transactional";
  campaign_id: string | null;
  contact_id: string | null;
  recipient: string;
  subject: string;
  html: string;
  text: string | null;
  template_name: string | null;
  provider: string | null;
  sender_from: string | null;
  reply_to: string | null;
  provider_domain: string | null;
  headers: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

function json(data: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function serviceRoleAuthorized(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  return Boolean(serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);
}

function cronAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  return Boolean(cronSecret && req.headers.get("x-cron-secret") === cronSecret);
}

async function markJob(
  admin: any,
  job: OutboxJob,
  status: "sent" | "failed" | "dead" | "suppressed",
  patch: Record<string, unknown>,
) {
  await admin
    .from("email_outbox")
    .update({
      status,
      lease_until: null,
      locked_by: null,
      ...patch,
    })
    .eq("id", job.id);

  if (status === "dead") {
    await admin.from("email_dead_letter").insert({
      outbox_id: job.id,
      company_id: job.company_id,
      stream: job.stream,
      campaign_id: job.campaign_id,
      recipient: job.recipient,
      subject: job.subject,
      attempts: job.attempts,
      last_error: String(patch.last_error ?? "Provider failure"),
      payload: job.metadata ?? {},
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (!serviceRoleAuthorized(req) && !cronAuthorized(req)) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, req);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401, req);
    }
    const { data: isSuperAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (isSuperAdmin !== true) {
      return json({ error: "Forbidden: super_admin only" }, 403, req);
    }
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit ?? Deno.env.get("EMAIL_OUTBOX_BATCH_SIZE") ?? 100), 500));
  const workerId = String(body.workerId ?? `email-outbox-${crypto.randomUUID()}`);
  const leaseSeconds = Math.max(30, Math.min(Number(body.leaseSeconds ?? 300), 3600));

  const { data: jobs, error } = await admin.rpc("claim_email_outbox_jobs", {
    p_limit: limit,
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });
  if (error) {
    return json({ error: error.message }, 500, req);
  }

  let sent = 0;
  let failed = 0;
  let dead = 0;
  let suppressedCount = 0;

  for (const job of ((jobs ?? []) as OutboxJob[])) {
    try {
      const suppression = await getSuppressedEmailMap(
        admin,
        [job.recipient],
        job.company_id,
        job.stream,
      );
      const suppressionHit = suppression.get(normalizeEmailAddress(job.recipient));
      if (suppressionHit) {
        await markJob(admin, job, "suppressed", {
          last_error: `Destinatario in suppression list (${suppressionHit.reason})`,
        });
        await logEmailDelivery(admin, {
          company_id: job.company_id,
          recipient: job.recipient,
          subject: job.subject,
          template_name: job.template_name ?? "email_outbox",
          status: "failed",
          provider: job.provider ?? "outbox",
          stream: job.stream,
          campaign_id: job.campaign_id,
          error_message: `Destinatario in suppression list (${suppressionHit.reason})`,
          metadata: { ...job.metadata, suppressed: true },
        });
        suppressedCount++;
        continue;
      }

      const settings = await loadProviderSettings(job.stream);
      const result = await sendViaProviderWithFailover(job.stream, settings, {
        from: job.sender_from || settings.fromDefault,
        to: [job.recipient],
        subject: job.subject,
        html: job.html,
        text: job.text ?? undefined,
        replyTo: job.reply_to ?? undefined,
        headers: job.headers ?? undefined,
      }, {
        domain: job.provider_domain ?? settings.domain ?? undefined,
        stream: job.stream,
        disableNativeTracking: job.stream === "marketing",
      });

      const providerUsed = result.providerUsed ?? settings.provider;
      const providerError = result.ok ? null : JSON.stringify(result.body);
      const isDead = !result.ok && job.attempts >= job.max_attempts;

      await markJob(admin, job, result.ok ? "sent" : isDead ? "dead" : "failed", {
        provider: providerUsed,
        provider_message_id: result.providerMessageId ?? null,
        last_error: providerError,
        sent_at: result.ok ? new Date().toISOString() : null,
      });

      if (job.stream === "marketing" && job.campaign_id && job.contact_id) {
        await admin.from("email_logs").insert({
          campaign_id: job.campaign_id,
          contact_id: job.contact_id,
          company_id: job.company_id,
          status: result.ok ? "delivered" : "failed",
          provider: providerUsed,
          provider_message_id: result.providerMessageId ?? null,
          stream: "marketing",
          event_timestamp: new Date().toISOString(),
          error_message: providerError,
        });
      }

      await logEmailDelivery(admin, {
        company_id: job.company_id,
        recipient: job.recipient,
        subject: job.subject,
        template_name: job.template_name ?? "email_outbox",
        status: result.ok ? "sent" : "failed",
        provider: providerUsed,
        stream: job.stream,
        campaign_id: job.campaign_id,
        provider_id: result.providerMessageId ?? null,
        error_message: providerError,
        metadata: { ...job.metadata, outbox_id: job.id },
      });

      if (result.ok) sent++;
      else if (isDead) dead++;
      else failed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDead = job.attempts >= job.max_attempts;
      await markJob(admin, job, isDead ? "dead" : "failed", {
        last_error: message,
      });
      if (isDead) dead++;
      else failed++;
    }
  }

  return json({
    success: true,
    claimed: (jobs ?? []).length,
    sent,
    failed,
    dead,
    suppressed: suppressedCount,
    workerId,
  }, 200, req);
});
