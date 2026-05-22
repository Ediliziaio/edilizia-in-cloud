// supabase/functions/meta-ads-spend-check/index.ts
//
// Worker cron oraria: per ogni company con ad_spend_guard attivo, verifica
// la spesa attuale (giornaliera + mensile) e:
//   • Se spesa giornaliera > daily_cap_cents → pausa tutte le campagne attive (Meta API + DB)
//   • Se spesa mensile > monthly_cap_cents → idem
//   • Se spesa > alert_threshold_pct% del cap → email titolare (best-effort)
//
// Dipende dai dati di meta_insights_cache, popolato da meta-ads-sync-insights.
// Se le tabelle non esistono, ritorna 200 con log skipped (graceful).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface SpendCheckResult {
  companies_checked: number;
  alerts_sent: number;
  campaigns_paused: number;
  errors: string[];
  duration_ms: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  const t0 = Date.now();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Auth: service_role only (chiamata cron)
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "service_role_required" }, 401, corsHeaders);
  }

  try {
    // Carica tutti gli spend guard attivi
    const { data: guards, error: guardsErr } = await admin
      .from("ad_spend_guard")
      .select("id, company_id, ad_account_id, monthly_cap_cents, daily_cap_cents, alert_threshold_pct, autopause_on_daily_cap, autopause_on_monthly_cap, alert_email, last_alert_at, last_autopause_at")
      .eq("is_active", true);

    if (guardsErr) {
      const msg = String(guardsErr.message ?? "");
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return json({ skipped: "schema_not_applied" }, 200, corsHeaders);
      }
      return json({ error: "guards_fetch_failed", detail: msg }, 500, corsHeaders);
    }

    const errors: string[] = [];
    let alertsSent = 0;
    let campaignsPaused = 0;

    // Oggi (YYYY-MM-DD) e primo del mese
    const today = new Date().toISOString().split("T")[0];
    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    const monthStart = firstOfMonth.toISOString().split("T")[0];

    for (const guard of guards ?? []) {
      try {
        // Calcola spesa giornaliera e mensile
        const filter = guard.ad_account_id
          ? { ad_account_id: guard.ad_account_id }
          : {};

        // Spesa giornaliera = insights di oggi (level=campaign)
        const dailyQuery = admin
          .from("meta_insights_cache")
          .select("spend_cents, campaign_id")
          .eq("company_id", guard.company_id)
          .eq("date_start", today)
          .eq("date_stop", today);

        const monthlyQuery = admin
          .from("meta_insights_cache")
          .select("spend_cents")
          .eq("company_id", guard.company_id)
          .gte("date_start", monthStart);

        const [dailyRes, monthlyRes] = await Promise.all([dailyQuery, monthlyQuery]);

        const dailySpend = (dailyRes.data ?? []).reduce(
          (sum, r) => sum + (r.spend_cents ?? 0),
          0,
        );
        const monthlySpend = (monthlyRes.data ?? []).reduce(
          (sum, r) => sum + (r.spend_cents ?? 0),
          0,
        );

        // Verifica autopause
        const exceededDaily = dailySpend > guard.daily_cap_cents;
        const exceededMonthly = monthlySpend > guard.monthly_cap_cents;
        const triggerAutopause =
          (exceededDaily && guard.autopause_on_daily_cap) ||
          (exceededMonthly && guard.autopause_on_monthly_cap);

        if (triggerAutopause) {
          // Pausa tutte le campagne attive di questo company/ad_account
          const pauseQuery = admin
            .from("meta_campaigns")
            .select("id, meta_campaign_id, integration_id")
            .eq("company_id", guard.company_id)
            .eq("status", "active")
            .not("meta_campaign_id", "is", null);
          if (guard.ad_account_id) pauseQuery.eq("ad_account_id", guard.ad_account_id);

          const { data: activeCampaigns } = await pauseQuery;

          for (const camp of activeCampaigns ?? []) {
            // Get token
            const { data: integ } = await admin
              .from("integrations")
              .select("access_token_encrypted")
              .eq("id", camp.integration_id)
              .maybeSingle();
            if (!integ?.access_token_encrypted) continue;

            try {
              const encKey = await getEncryptionKey();
              const accessToken = await decrypt(integ.access_token_encrypted, encKey);

              // Pausa su Meta
              await fetch(`https://graph.facebook.com/${apiVersion}/${camp.meta_campaign_id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "PAUSED", access_token: accessToken }),
              });

              // Pausa in DB
              await admin
                .from("meta_campaigns")
                .update({ status: "paused", last_synced_at: new Date().toISOString() })
                .eq("id", camp.id);

              campaignsPaused += 1;
            } catch (e) {
              errors.push(`pause_failed:${camp.meta_campaign_id}:${String(e)}`);
            }
          }

          // Aggiorna guard con motivo
          const reason = exceededDaily
            ? `daily_cap_exceeded:${dailySpend / 100}€`
            : `monthly_cap_exceeded:${monthlySpend / 100}€`;

          await admin
            .from("ad_spend_guard")
            .update({
              last_autopause_at: new Date().toISOString(),
              last_autopause_reason: reason,
            })
            .eq("id", guard.id);

          // Sleep guard: non alertare di nuovo per 24h se già fatto
          const shouldAlert =
            !guard.last_autopause_at ||
            new Date(guard.last_autopause_at).getTime() < Date.now() - 24 * 3600 * 1000;
          if (shouldAlert) {
            // TODO: invio email titolare via send-transactional-email
            alertsSent += 1;
          }
        } else {
          // Verifica solo alert threshold (pre-autopause warning)
          const pct = Math.round((monthlySpend / guard.monthly_cap_cents) * 100);
          const shouldAlert =
            pct >= guard.alert_threshold_pct &&
            (!guard.last_alert_at ||
              new Date(guard.last_alert_at).getTime() < Date.now() - 6 * 3600 * 1000);

          if (shouldAlert) {
            // TODO: send alert email
            await admin
              .from("ad_spend_guard")
              .update({ last_alert_at: new Date().toISOString() })
              .eq("id", guard.id);
            alertsSent += 1;
          }
        }
      } catch (e) {
        errors.push(`guard_${guard.id}_failed:${String(e)}`);
      }
    }

    const result: SpendCheckResult = {
      companies_checked: (guards ?? []).length,
      alerts_sent: alertsSent,
      campaigns_paused: campaignsPaused,
      errors,
      duration_ms: Date.now() - t0,
    };

    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-ads-spend-check] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
