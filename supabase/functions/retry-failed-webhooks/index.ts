/**
 * retry-failed-webhooks — IMP-5
 * Chiamata ogni 5 minuti da pg_cron (o manualmente dal WebhookAlertsPanel).
 * Ritenta i webhook falliti con backoff esponenziale (5m → 15m → 60m).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";

const BACKOFF_MINUTES = [5, 15, 60]; // minuti di attesa per ogni tentativo

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  // Auth: solo cron interno o super_admin
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret  = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verifica autorizzazione
  if (cronSecret && reqSecret === cronSecret) {
    // ok: chiamata da cron
  } else if (authHeader?.startsWith("Bearer ")) {
    // Verifica che sia super_admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }
  } else {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();
  const results = { processed: 0, retried_ok: 0, failed_again: 0, exhausted: 0 };

  // Carica webhook in coda retry
  const { data: queue, error: queueErr } = await (supabase
    .from("webhook_logs" as never)
    .select("*")
    .eq("status", "failed")
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", now)
    .limit(50) as unknown as Promise<{
      data: Array<{
        id: string;
        provider: string;
        event_type: string;
        payload: Record<string, unknown>;
        attempts: number;
        max_retries: number;
        last_error: string | null;
      }> | null;
      error: { message: string } | null;
    }>);

  if (queueErr) {
    console.error("[retry-webhooks] Queue fetch error:", queueErr.message);
    return new Response(JSON.stringify({ error: queueErr.message }), {
      status: 500, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  for (const wh of queue ?? []) {
    results.processed++;
    const attemptNum = wh.attempts; // tentativo corrente (1-based dopo il primo fallimento)

    try {
      // Ritenta chiamata HTTP originale verso il provider
      const providerUrl = getProviderUrl(wh.provider, supabaseUrl);
      if (!providerUrl) {
        throw new Error(`Provider sconosciuto: ${wh.provider}`);
      }

      const res = await fetch(providerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-retry": "true",
          "x-original-event": wh.event_type,
        },
        body: JSON.stringify(wh.payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }

      // Successo
      await (supabase as any)
        .from("webhook_logs")
        .update({
          status: "retried",
          attempts: attemptNum + 1,
          processed_at: new Date().toISOString(),
          next_retry_at: null,
          last_error: null,
        })
        .eq("id", wh.id);

      results.retried_ok++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newAttempts = attemptNum + 1;
      const isExhausted = newAttempts > wh.max_retries;

      if (isExhausted) {
        // Tutti i retry esauriti → status exhausted + notifica CS
        await (supabase as any)
          .from("webhook_logs")
          .update({
            status: "exhausted",
            attempts: newAttempts,
            next_retry_at: null,
            last_error: errMsg,
          })
          .eq("id", wh.id);

        results.exhausted++;
        console.error(`[retry-webhooks] Webhook ${wh.id} esaurito dopo ${wh.max_retries} tentativi`);
      } else {
        // Calcola prossimo retry con backoff
        const backoffMin = BACKOFF_MINUTES[Math.min(newAttempts - 1, BACKOFF_MINUTES.length - 1)];
        const nextRetry = new Date(Date.now() + backoffMin * 60 * 1000).toISOString();

        await (supabase as any)
          .from("webhook_logs")
          .update({
            attempts: newAttempts,
            next_retry_at: nextRetry,
            last_error: errMsg,
          })
          .eq("id", wh.id);

        results.failed_again++;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, ...results }),
    { headers: { ...corsH, "Content-Type": "application/json" } }
  );
});

/** Mappa provider → URL edge function per il retry */
function getProviderUrl(provider: string, supabaseUrl: string): string | null {
  const base = `${supabaseUrl}/functions/v1`;
  switch (provider.toLowerCase()) {
    case "stripe":    return `${base}/stripe-webhook`;
    case "gocardless": return `${base}/billing-webhook`;
    case "bank":      return `${base}/bank-webhook`;
    default:          return null;
  }
}
