import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole, isInternalRequest } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface IntegrationResult {
  name: string;
  status: "healthy" | "degraded" | "down" | "unconfigured";
  last_seen: string | null;
  response_ms: number | null;
  error: string | null;
  metadata?: Record<string, unknown> | null;
}

type EmailProvider =
  | "elastic_email"
  | "sendgrid"
  | "brevo"
  | "resend"
  | "mailgun";

type EmailProbeResult = {
  status: IntegrationResult["status"];
  response_ms: number | null;
  error: string | null;
};

async function pingWithLatency(url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), ...options });
    return { ok: res.ok, status: res.status, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, status: 0, latency_ms: Date.now() - start, error: (e as Error).message };
  }
}

const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  elastic_email: "Elastic Email",
  sendgrid: "SendGrid",
  brevo: "Brevo",
  resend: "Resend",
  mailgun: "Mailgun",
};

function normalizeEmailProvider(value: string | undefined, fallback: EmailProvider): EmailProvider {
  switch ((value || "").trim().toLowerCase()) {
    case "elasticemail":
    case "elastic_email":
      return "elastic_email";
    case "sendgrid":
      return "sendgrid";
    case "sendinblue":
    case "brevo":
      return "brevo";
    case "resend":
      return "resend";
    case "mailgun":
      return "mailgun";
    default:
      return fallback;
  }
}

function classifyEmailProbe(ping: Awaited<ReturnType<typeof pingWithLatency>>): EmailProbeResult {
  if (ping.ok || [400, 405, 409, 415, 422].includes(ping.status)) {
    return { status: "healthy", response_ms: ping.latency_ms, error: null };
  }
  if ([401, 403, 429].includes(ping.status)) {
    return {
      status: "degraded",
      response_ms: ping.latency_ms,
      error: ping.error || `HTTP ${ping.status}`,
    };
  }
  return {
    status: "down",
    response_ms: ping.latency_ms,
    error: ping.error || `HTTP ${ping.status}`,
  };
}

async function probeEmailProvider(
  provider: EmailProvider,
  apiKey: string,
  stream: "marketing" | "transactional",
  domain?: string | null,
): Promise<EmailProbeResult> {
  if (!apiKey) {
    return {
      status: "unconfigured",
      response_ms: null,
      error: "API key not configured",
    };
  }

  switch (provider) {
    case "elastic_email": {
      const endpoint = stream === "marketing"
        ? "https://api.elasticemail.com/v4/emails"
        : "https://api.elasticemail.com/v4/emails/transactional";
      const ping = await pingWithLatency(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ElasticEmail-ApiKey": apiKey,
        },
        body: "{}",
      });
      return classifyEmailProbe(ping);
    }

    case "sendgrid": {
      const ping = await pingWithLatency("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: "{}",
      });
      return classifyEmailProbe(ping);
    }

    case "brevo": {
      const ping = await pingWithLatency("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: "{}",
      });
      return classifyEmailProbe(ping);
    }

    case "resend": {
      const ping = await pingWithLatency("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: "{}",
      });
      return classifyEmailProbe(ping);
    }

    case "mailgun": {
      if (!domain) {
        return {
          status: "unconfigured",
          response_ms: null,
          error: "Mailgun domain not configured",
        };
      }
      const ping = await pingWithLatency(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
      });
      if (ping.status === 404) {
        return {
          status: "degraded",
          response_ms: ping.latency_ms,
          error: "Mailgun domain non trovato o non autorizzato",
        };
      }
      return classifyEmailProbe(ping);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Due chiamanti legittimi, un solo controllo di salute.
    //
    // Prima questa funzione accettava soltanto un JWT di super_admin: era
    // quindi impossibile pianificarla, e infatti nessun cron la chiamava.
    // Risultato: integration_health_log si popolava solo quando qualcuno
    // apriva la pagina a mano — il monitoraggio delle integrazioni esisteva
    // ma non girava. Ora accetta anche il segreto interno usato dagli altri
    // job pianificati.
    let admin;
    if (isInternalRequest(req)) {
      admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
    } else {
      const auth = await requireAuth(req, getCorsHeaders(req));
      await requireRole(auth.supabaseAdmin, auth.userId, ["super_admin"], getCorsHeaders(req));
      admin = auth.supabaseAdmin;
    }
    const isSuperAdmin = true;

    // Read platform_settings keys
    const settingsKeys = [
      "stripe_secret_key",
      "meta_app_id",
      "meta_app_secret",
      "email_marketing_api_key",
      "email_marketing_provider",
      "email_marketing_domain",
      "email_marketing_failover_providers",
      "email_transactional_api_key",
      "email_transactional_provider",
      "email_transactional_domain",
      "email_transactional_failover_providers",
      "email_provider_webhook_secret",
      "email_mailgun_webhook_signing_key",
      "email_resend_webhook_secret",
      "elevenlabs_api_key",
      "whatsapp_verify_token",
      "telnyx_api_key",
      "gocardless_access_token",
      "google_maps_api_key",
      "openai_api_key",
      "render_gemini_api_key",
      "gemini_api_key",
      "cloudflare_api_token",
      "cloudflare_account_id",
    ];

    const { data: settings } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", settingsKeys);

    const settingsMap: Record<string, string> = {};
    for (const row of settings || []) {
      if (row.value) settingsMap[row.key] = row.value;
    }

    const results: IntegrationResult[] = [];
    const now = new Date().toISOString();

    // ── Supabase ─────────────────────────────────────────────────────────
    const supabaseStarted = Date.now();
    const { error: supabasePingError } = await admin
      .from("companies")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    results.push({
      name: "supabase",
      status: supabasePingError ? "down" : "healthy",
      last_seen: now,
      response_ms: Date.now() - supabaseStarted,
      error: supabasePingError?.message ?? null,
    });

    // ── Stripe ────────────────────────────────────────────────────────────
    const stripeKey = settingsMap["stripe_secret_key"] || Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      const ping = await pingWithLatency("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      results.push({
        name: "stripe",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "stripe", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── OpenAI ────────────────────────────────────────────────────────────
    const openaiKey = settingsMap["openai_api_key"] || Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
      const ping = await pingWithLatency("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${openaiKey}` },
      });
      results.push({
        name: "openai",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "openai", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── Gemini Render AI ─────────────────────────────────────────────────
    const geminiKey =
      settingsMap["render_gemini_api_key"] ||
      settingsMap["gemini_api_key"] ||
      Deno.env.get("RENDER_GEMINI_API_KEY") ||
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_AI_API_KEY");
    if (geminiKey) {
      const ping = await pingWithLatency(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`
      );
      results.push({
        name: "gemini",
        status: ping.ok ? "healthy" : ping.status === 400 || ping.status === 401 || ping.status === 403 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "gemini", status: "unconfigured", last_seen: null, response_ms: null, error: "Render AI key not configured" });
    }

    // ── Cloudflare ───────────────────────────────────────────────────────
    const cloudflareToken = settingsMap["cloudflare_api_token"] || Deno.env.get("CLOUDFLARE_API_TOKEN");
    const cloudflareAccountId = settingsMap["cloudflare_account_id"] || Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    if (cloudflareToken) {
      const cloudflareUrl = cloudflareAccountId
        ? `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}`
        : "https://api.cloudflare.com/client/v4/user/tokens/verify";
      const ping = await pingWithLatency(cloudflareUrl, {
        headers: { Authorization: `Bearer ${cloudflareToken}` },
      });
      results.push({
        name: "cloudflare",
        status: ping.ok ? "healthy" : ping.status === 401 || ping.status === 403 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "cloudflare", status: "unconfigured", last_seen: null, response_ms: null, error: "API token not configured" });
    }

    // ── Email providers (stream-aware, provider-aware) ─────────────────────
    const webhookSecretSource = Deno.env.get("WEBHOOK_SECRET")
      ? "env"
      : settingsMap["email_provider_webhook_secret"]
        ? "platform_settings"
        : "missing";
    const webhookSecretConfigured = webhookSecretSource !== "missing";
    const mailgunSigningConfigured = Boolean(
      Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY") || settingsMap["email_mailgun_webhook_signing_key"],
    );
    const resendSigningConfigured = Boolean(
      Deno.env.get("RESEND_WEBHOOK_SECRET") || settingsMap["email_resend_webhook_secret"],
    );
    const parseProviderList = (raw: string | undefined) =>
      (raw || "")
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .replace(/"/g, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const emailStreams = {
      marketing: {
        provider: normalizeEmailProvider(
          settingsMap["email_marketing_provider"],
          "elastic_email",
        ),
        apiKey:
          settingsMap["email_marketing_api_key"] ||
          Deno.env.get("EMAIL_MARKETING_API_KEY") ||
          "",
        domain: settingsMap["email_marketing_domain"] || null,
      },
      transactional: {
        provider: normalizeEmailProvider(
          settingsMap["email_transactional_provider"],
          "resend",
        ),
        apiKey:
          settingsMap["email_transactional_api_key"] ||
          Deno.env.get("EMAIL_TRANSACTIONAL_API_KEY") ||
          "",
        domain: settingsMap["email_transactional_domain"] || null,
      },
    } as const;

    const marketingProbe = await probeEmailProvider(
      emailStreams.marketing.provider,
      emailStreams.marketing.apiKey,
      "marketing",
      emailStreams.marketing.domain,
    );
    const transactionalProbe = await probeEmailProvider(
      emailStreams.transactional.provider,
      emailStreams.transactional.apiKey,
      "transactional",
      emailStreams.transactional.domain,
    );

    results.push({
      name: "email_marketing",
      status: marketingProbe.status,
      last_seen: marketingProbe.status === "unconfigured" ? null : now,
      response_ms: marketingProbe.response_ms,
      error: marketingProbe.error,
      metadata: {
        provider: emailStreams.marketing.provider,
        provider_label: EMAIL_PROVIDER_LABELS[emailStreams.marketing.provider],
        stream: "marketing",
        webhook_secret_configured: webhookSecretConfigured,
        webhook_secret_source: webhookSecretSource,
      },
    });
    results.push({
      name: "email_transactional",
      status: transactionalProbe.status,
      last_seen: transactionalProbe.status === "unconfigured" ? null : now,
      response_ms: transactionalProbe.response_ms,
      error: transactionalProbe.error,
      metadata: {
        provider: emailStreams.transactional.provider,
        provider_label: EMAIL_PROVIDER_LABELS[emailStreams.transactional.provider],
        stream: "transactional",
        webhook_secret_configured: webhookSecretConfigured,
        webhook_secret_source: webhookSecretSource,
      },
    });

    // ── Email outbox health ───────────────────────────────────────────────
    let emailOutbox: Record<string, unknown> | null = null;
    try {
      const countStatus = async (status: string) => {
        const { count, error } = await admin
          .from("email_outbox")
          .select("id", { head: true, count: "exact" })
          .eq("status", status);
        if (error) throw error;
        return count ?? 0;
      };
      const [
        queued,
        processing,
        failed,
        dead,
        suppressed,
        oldestReady,
      ] = await Promise.all([
        countStatus("queued"),
        countStatus("processing"),
        countStatus("failed"),
        countStatus("dead"),
        countStatus("suppressed"),
        admin
          .from("email_outbox")
          .select("scheduled_at, created_at")
          .in("status", ["queued", "failed"])
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      const oldestAt = oldestReady.data?.scheduled_at ?? oldestReady.data?.created_at ?? null;
      const oldestAgeMinutes = oldestAt
        ? Math.max(0, Math.round((Date.now() - new Date(oldestAt).getTime()) / 60000))
        : 0;
      const outboxStatus: IntegrationResult["status"] =
        dead > 0 || oldestAgeMinutes > 60 || queued > 5000 ? "degraded" : "healthy";
      emailOutbox = {
        queued,
        processing,
        failed,
        dead,
        suppressed,
        oldestReadyAt: oldestAt,
        oldestReadyAgeMinutes: oldestAgeMinutes,
      };
      results.push({
        name: "email_outbox",
        status: outboxStatus,
        last_seen: now,
        response_ms: null,
        error: outboxStatus === "healthy"
          ? null
          : "Outbox email con backlog, errori definitivi o job vecchi da processare",
        metadata: emailOutbox,
      });
    } catch (outboxErr) {
      emailOutbox = {
        available: false,
        error: outboxErr instanceof Error ? outboxErr.message : String(outboxErr),
      };
      results.push({
        name: "email_outbox",
        status: "unconfigured",
        last_seen: null,
        response_ms: null,
        error: "email_outbox non disponibile: applicare la migration enterprise hardening",
        metadata: emailOutbox,
      });
    }

    // ── ElevenLabs ────────────────────────────────────────────────────────
    const elevenKey = settingsMap["elevenlabs_api_key"] || Deno.env.get("ELEVENLABS_API_KEY");
    if (elevenKey) {
      const ping = await pingWithLatency("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": elevenKey },
      });
      results.push({
        name: "elevenlabs",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "elevenlabs", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── Telnyx ────────────────────────────────────────────────────────────
    const telnyxKey = settingsMap["telnyx_api_key"] || Deno.env.get("TELNYX_API_KEY");
    if (telnyxKey) {
      const ping = await pingWithLatency("https://api.telnyx.com/v2/balance", {
        headers: { Authorization: `Bearer ${telnyxKey}` },
      });
      results.push({
        name: "telnyx",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "telnyx", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── GoCardless ────────────────────────────────────────────────────────
    const gcToken = settingsMap["gocardless_access_token"] || Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
    if (gcToken) {
      const ping = await pingWithLatency("https://api.gocardless.com/creditors", {
        headers: {
          Authorization: `Bearer ${gcToken}`,
          "GoCardless-Version": "2015-07-06",
        },
      });
      results.push({
        name: "gocardless",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "gocardless", status: "unconfigured", last_seen: null, response_ms: null, error: "Token not configured" });
    }

    // ── WhatsApp (Meta) ───────────────────────────────────────────────────
    const metaAppId = settingsMap["meta_app_id"] || Deno.env.get("META_APP_ID");
    const metaAppSecret = settingsMap["meta_app_secret"] || Deno.env.get("META_APP_SECRET");
    if (metaAppId && metaAppSecret) {
      const ping = await pingWithLatency(
        `https://graph.facebook.com/v18.0/${metaAppId}?fields=id,name&access_token=${metaAppId}|${metaAppSecret}`
      );
      results.push({
        name: "meta_whatsapp",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "meta_whatsapp", status: "unconfigured", last_seen: null, response_ms: null, error: "Meta credentials not configured" });
    }

    // ── Google Maps ───────────────────────────────────────────────────────
    const mapsKey = settingsMap["google_maps_api_key"] || Deno.env.get("GOOGLE_MAPS_API_KEY");
    results.push({
      name: "google_maps",
      status: mapsKey ? "healthy" : "unconfigured",
      last_seen: mapsKey ? now : null,
      response_ms: null,
      error: mapsKey ? null : "API key not configured",
    });

    // ── Persist results to integration_health_log (super_admin only) ──────
    if (isSuperAdmin) {
      const rows = results
        .filter((r) => r.status !== "unconfigured")
        .map((r) => ({
          integration_name: r.name,
          company_id: null,
          status: r.status,
          response_ms: r.response_ms,
          error_message: r.error,
          checked_at: now,
        }));

      if (rows.length > 0) {
        await admin.from("integration_health_log" as never).insert(rows as never);
      }
    }

    // ── Legacy compatibility: also return flat boolean map ─────────────────
    const legacy = {
      whatsapp: results.find((r) => r.name === "meta_whatsapp")?.status === "healthy",
      googlemaps: results.find((r) => r.name === "google_maps")?.status === "healthy",
      meta: results.find((r) => r.name === "meta_whatsapp")?.status === "healthy",
      email: marketingProbe.status === "healthy",
      email_marketing: marketingProbe.status === "healthy",
      email_transactional: transactionalProbe.status === "healthy",
      elevenlabs: results.find((r) => r.name === "elevenlabs")?.status === "healthy",
      openai: results.find((r) => r.name === "openai")?.status === "healthy",
      gemini: results.find((r) => r.name === "gemini")?.status === "healthy",
      cloudflare: results.find((r) => r.name === "cloudflare")?.status === "healthy",
      supabase: results.find((r) => r.name === "supabase")?.status === "healthy",
    };

    return new Response(
      JSON.stringify({
        integrations: results,
        email_streams: {
          marketing: {
            provider: emailStreams.marketing.provider,
            providerLabel: EMAIL_PROVIDER_LABELS[emailStreams.marketing.provider],
            status: marketingProbe.status,
            responseMs: marketingProbe.response_ms,
            error: marketingProbe.error,
            webhookSecretConfigured,
            webhookSecretSource,
            failoverProviders: parseProviderList(settingsMap["email_marketing_failover_providers"]),
          },
          transactional: {
            provider: emailStreams.transactional.provider,
            providerLabel: EMAIL_PROVIDER_LABELS[emailStreams.transactional.provider],
            status: transactionalProbe.status,
            responseMs: transactionalProbe.response_ms,
            error: transactionalProbe.error,
            webhookSecretConfigured,
            webhookSecretSource,
            failoverProviders: parseProviderList(settingsMap["email_transactional_failover_providers"]),
          },
        },
        email_webhook: {
          secretConfigured: webhookSecretConfigured,
          secretSource: webhookSecretSource,
          mailgunSigningConfigured,
          resendSigningConfigured,
        },
        email_outbox: emailOutbox,
        ...legacy,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("check-api-health error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
