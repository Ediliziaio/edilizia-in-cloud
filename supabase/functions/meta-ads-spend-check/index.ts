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
import { traduciErroreMeta } from "../_shared/metaAdsPubblicazione.ts";

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

  // Auth: service_role oppure x-cron-secret (stesso pattern degli altri cron
  // meta-*: il job pg_cron invia l'header col CRON_SECRET).
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const viaCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  if (!viaCron && authHeader !== `Bearer ${serviceKey}`) {
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
    // Un token per integrazione, decifrato una volta sola per giro.
    const tokenCache = new Map<string, string | null>();

    // Oggi (YYYY-MM-DD) e primo del mese
    const today = new Date().toISOString().split("T")[0];
    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    const monthStart = firstOfMonth.toISOString().split("T")[0];

    for (const guard of guards ?? []) {
      try {
        // Calcola spesa giornaliera e mensile
        // Spesa giornaliera = insights di oggi (level=campaign).
        // FIX SOLDI: il filtro per ad_account era calcolato ma MAI applicato
        // alle query → un guard per-account sommava la spesa di TUTTA
        // l'azienda e poteva autopausare campagne di un account per
        // l'overspend di un altro.
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

        if (guard.ad_account_id) {
          dailyQuery.eq("ad_account_id", guard.ad_account_id);
          monthlyQuery.eq("ad_account_id", guard.ad_account_id);
        }

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
            // Token — vive su integration_credentials (AES-GCM). Se la campagna
            // ha perso integration_id si usa l'integrazione Meta dell'azienda.
            // Prima un token mancante veniva saltato in silenzio: la campagna
            // restava accesa oltre il tetto e nessuno lo sapeva.
            const accessToken = await tokenPerCampagna(admin, guard.company_id, camp.integration_id, tokenCache);
            if (!accessToken) {
              const msg = "Pausa automatica non riuscita: il collegamento con Meta non ha un token valido. Ricollega Meta e ferma la campagna da Gestione inserzioni.";
              errors.push(`pause_skipped:${camp.meta_campaign_id}:${msg}`);
              await admin.from("meta_campaigns").update({ publish_error: msg }).eq("id", camp.id);
              continue;
            }

            try {
              // Pausa su Meta — prima la risposta non veniva letta: un rifiuto
              // (permesso mancante, token scaduto) segnava comunque «in pausa»
              // nel gestionale mentre su Meta la campagna continuava a spendere.
              const resp = await fetch(`https://graph.facebook.com/${apiVersion}/${camp.meta_campaign_id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "PAUSED", access_token: accessToken }),
              });
              const testo = await resp.text();
              let corpo: unknown = null;
              try {
                corpo = JSON.parse(testo);
              } catch {
                corpo = null;
              }
              if (!resp.ok || (corpo as { error?: unknown } | null)?.error) {
                const errore = traduciErroreMeta(corpo ?? testo);
                errors.push(`pause_failed:${camp.meta_campaign_id}:${errore.messaggio}`);
                await admin
                  .from("meta_campaigns")
                  .update({ publish_error: `Pausa automatica non riuscita: ${errore.messaggio}` })
                  .eq("id", camp.id);
                continue;
              }

              // Pausa in DB
              await admin
                .from("meta_campaigns")
                .update({ status: "paused", publish_error: null, last_synced_at: new Date().toISOString() })
                .eq("id", camp.id);

              campaignsPaused += 1;
            } catch (e) {
              errors.push(`pause_failed:${camp.meta_campaign_id}:Meta non raggiungibile: ${String(e)}`);
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

/** Token Meta in chiaro per la campagna; null se manca o non si decifra. */
async function tokenPerCampagna(
  // deno-lint-ignore no-explicit-any
  admin: any,
  companyId: string,
  integrationId: string | null,
  cache: Map<string, string | null>,
): Promise<string | null> {
  let id = integrationId;
  if (!id) {
    const { data } = await admin
      .from("integrations")
      .select("id")
      .eq("company_id", companyId)
      .eq("provider", "meta")
      .maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  const { data: cred } = await admin
    .from("integration_credentials")
    .select("access_token_encrypted")
    .eq("integration_id", id)
    .maybeSingle();
  let token: string | null = null;
  if (cred?.access_token_encrypted) {
    try {
      token = await decrypt(cred.access_token_encrypted, await getEncryptionKey());
    } catch (e) {
      console.warn("[meta-ads-spend-check] decrypt failed", e);
    }
  }
  cache.set(id, token);
  return token;
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
