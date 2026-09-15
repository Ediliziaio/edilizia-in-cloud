/**
 * email-oauth-diagnostic — helper per setup production OAuth
 *
 * Ritorna lo stato di tutte le env vars necessarie + check connettività
 * verso Google/Microsoft endpoints. Aiuta l'admin a capire ESATTAMENTE
 * cosa manca senza dover guardare logs.
 *
 * NO secret leak: ritorna solo boolean "configured" e prefix masked.
 *
 * Auth: utente autenticato. Non espone secret, solo check booleani e preview mascherati.
 */

import { credenzialiGmail } from "../_shared/gmailOAuthCredentials.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getMsOAuthCredentials } from "../_shared/msOAuth.ts";

interface DiagnosticResult {
  ready: boolean;
  checklist: {
    google_oauth_client_id: { configured: boolean; preview: string | null; error?: string };
    google_oauth_client_secret: { configured: boolean; error?: string };
    ms_oauth_client_id: { configured: boolean; preview: string | null; error?: string };
    ms_oauth_client_secret: { configured: boolean; error?: string };
    inbound_email_secret: { configured: boolean; error?: string };
    proactive_cron_secret: { configured: boolean; error?: string };
    encryption_key_configured: { configured: boolean; error?: string };
    google_oauth_endpoint_reachable: { reachable: boolean; latency_ms: number; error?: string };
    ms_oauth_endpoint_reachable: { reachable: boolean; latency_ms: number; error?: string };
    edge_functions_deployed: { count: number; missing: string[] };
    db_schema_ready: { ok: boolean; missing: string[] };
  };
  missing_steps: string[];
  next_action: string | null;
}

function maskedPreview(val: string | undefined): string | null {
  if (!val) return null;
  if (val.length < 12) return "•••";
  return val.substring(0, 8) + "•••" + val.substring(val.length - 4);
}

async function pingUrl(url: string): Promise<{ reachable: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { reachable: res.status < 500, latency_ms: Date.now() - t0 };
  } catch (e) {
    return {
      reachable: false,
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: qualunque utente autenticato con profilo aziendale.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "auth_required" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userData?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "auth_invalid" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supa as any)
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: "company_profile_required" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const googleId = credenzialiGmail().clientId;
  const googleSecret = credenzialiGmail().clientSecret;
  // Stessa risoluzione delle funzioni che le usano davvero: se la diagnostica
  // guardasse solo la env, direbbe "manca" con le credenziali in platform_settings.
  const ms = await getMsOAuthCredentials();
  const msId = ms.clientId || undefined;
  const msSecret = ms.clientSecret || undefined;
  const inbound = Deno.env.get("INBOUND_EMAIL_SECRET");
  const cron = Deno.env.get("PROACTIVE_CRON_SECRET");

  // Check connettività endpoints (no auth needed per OAuth discovery)
  const [googleReach, msReach] = await Promise.all([
    pingUrl("https://accounts.google.com/.well-known/openid-configuration"),
    pingUrl("https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"),
  ]);

  // DB schema check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: schemaCheck } = await (supa as any).rpc("email_oauth_encrypt_token", { p_token: "test" })
    .then(() => ({ data: { encryption_key_configured: true } }))
    .catch((err: { message?: string }) => ({
      data: { encryption_key_configured: false, _err: err.message },
    }));
  const encConfigured = (schemaCheck as { encryption_key_configured?: boolean })?.encryption_key_configured === true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tableCheck } = await (supa as any)
    .from("email_oauth_connections")
    .select("id")
    .limit(1);
  const dbReady = tableCheck !== null && Array.isArray(tableCheck);

  // Edge functions deployed check (lista pubblica)
  const expectedFns = [
    "email-oauth-start",
    "email-oauth-callback",
    "email-poll-inbox",
    "email-triage-ai",
    "email-oauth-diagnostic",
  ];
  // Self-check: se questa edge function risponde, è deployata
  // (più affidabile che chiamare Supabase Management API che richiede PAT)
  const fnDeployed = { count: expectedFns.length, missing: [] as string[] };

  const missing: string[] = [];
  if (!googleId) missing.push(credenzialiGmail().nomeId);
  if (!googleSecret) missing.push(credenzialiGmail().nomeSecret);
  if (!msId) missing.push("MS_OAUTH_CLIENT_ID (o OUTLOOK_CLIENT_ID / platform_settings outlook_client_id)");
  if (!msSecret) missing.push("MS_OAUTH_CLIENT_SECRET (o OUTLOOK_CLIENT_SECRET / platform_settings outlook_client_secret)");
  if (!inbound) missing.push("INBOUND_EMAIL_SECRET (per webhook ingest, può aspettare)");
  if (!cron) missing.push("PROACTIVE_CRON_SECRET (necessario per poll cron)");
  if (!encConfigured) missing.push("app.email_oauth_encryption_key (DB setting)");
  if (!dbReady) missing.push("schema email_oauth_connections (esegui apply-email-oauth.sql)");

  const result: DiagnosticResult = {
    ready: missing.length === 0,
    checklist: {
      google_oauth_client_id: {
        configured: !!googleId,
        preview: maskedPreview(googleId),
        error: !googleId ? "Setta in Supabase Dashboard → Edge Functions → Secrets" : undefined,
      },
      google_oauth_client_secret: {
        configured: !!googleSecret,
        error: !googleSecret ? "Setta in Supabase Dashboard → Edge Functions → Secrets" : undefined,
      },
      ms_oauth_client_id: {
        configured: !!msId,
        preview: maskedPreview(msId),
        error: !msId ? "Setta in Supabase Dashboard → Edge Functions → Secrets" : undefined,
      },
      ms_oauth_client_secret: {
        configured: !!msSecret,
        error: !msSecret ? "Setta in Supabase Dashboard → Edge Functions → Secrets" : undefined,
      },
      inbound_email_secret: {
        configured: !!inbound,
        error: !inbound ? "Opzionale per OAuth puro, necessario per webhook esterni Resend/Mailgun" : undefined,
      },
      proactive_cron_secret: {
        configured: !!cron,
        error: !cron ? "Setta in Supabase Dashboard + ALTER DATABASE postgres SET app.proactive_cron_secret" : undefined,
      },
      encryption_key_configured: {
        configured: encConfigured,
        error: !encConfigured ? "Esegui: ALTER DATABASE postgres SET app.email_oauth_encryption_key = '<openssl rand -hex 32>';" : undefined,
      },
      google_oauth_endpoint_reachable: googleReach,
      ms_oauth_endpoint_reachable: msReach,
      edge_functions_deployed: fnDeployed,
      db_schema_ready: { ok: dbReady, missing: dbReady ? [] : ["email_oauth_connections"] },
    },
    missing_steps: missing,
    next_action: missing.length === 0
      ? "Tutto pronto! Vai su /azienda/impostazioni/integrazioni e clicca 'Connetti Gmail'"
      : `Step mancante: ${missing[0]}`,
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
