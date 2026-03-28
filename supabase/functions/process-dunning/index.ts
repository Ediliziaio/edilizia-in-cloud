/**
 * process-dunning — Dunning / payment recovery sequence
 *
 * Called daily via cron. Identifies companies in the grace period or with
 * expired trials and sends the appropriate recovery email.
 *
 * Dunning sequence (days after expiry):
 *   Day 0  → "Abbonamento scaduto" soft notification
 *   Day 3  → "Accesso sospeso a breve" urgent reminder
 *   Day 7  → "Ultimo avviso" final warning
 *   Day 14 → account suspended automatically
 *
 * Trial expiry sequence:
 *   Day -3 → "Il tuo trial scade tra 3 giorni" upsell
 *   Day  0 → "Trial scaduto" conversion
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendEmail } from "../_shared/emailProvider.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function daysDiff(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(date: string): number {
  return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function buildExpiredEmail(company: any, daysExpired: number): string {
  const urgency = daysExpired >= 7
    ? `<p style="color:#dc2626;font-weight:bold;">⚠️ Ultimo avviso: il tuo account verrà sospeso definitivamente tra ${14 - daysExpired} giorni.</p>`
    : daysExpired >= 3
    ? `<p style="color:#ea580c;font-weight:bold;">Il tuo accesso verrà sospeso tra ${14 - daysExpired} giorni se non rinnovi.</p>`
    : `<p>Il tuo abbonamento è scaduto. Rinnova ora per continuare ad usare la piattaforma.</p>`;

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#111;">Abbonamento scaduto — ${company.name}</h2>
      ${urgency}
      <p>Caro cliente, il tuo abbonamento alla piattaforma è scaduto da <strong>${daysExpired} giorni</strong>.</p>
      <p>Per continuare ad usare tutti i servizi senza interruzioni, effettua il rinnovo cliccando sul pulsante qui sotto.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${Deno.env.get("APP_URL") || "https://app.edilizia.cloud"}/azienda/impostazioni/abbonamento"
           style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
          Rinnova abbonamento
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;">Hai bisogno di aiuto? Rispondi a questa email o contatta il supporto.</p>
    </div>
  `;
}

function buildTrialEmail(company: any, daysLeft: number): string {
  if (daysLeft <= 0) {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#111;">Il tuo periodo di prova è terminato</h2>
        <p>Caro cliente, il periodo di prova gratuito di <strong>${company.name}</strong> è terminato.</p>
        <p>Per continuare ad usare la piattaforma scegli il piano più adatto alle tue esigenze.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${Deno.env.get("APP_URL") || "https://app.edilizia.cloud"}/azienda/impostazioni/abbonamento"
             style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
            Scegli un piano
          </a>
        </div>
      </div>
    `;
  }
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#111;">Il tuo trial scade tra ${daysLeft} giorni</h2>
      <p>Caro cliente, il periodo di prova gratuito di <strong>${company.name}</strong> scadrà tra <strong>${daysLeft} giorni</strong>.</p>
      <p>Non perdere l'accesso alle tue funzionalità — attiva subito il tuo abbonamento.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${Deno.env.get("APP_URL") || "https://app.edilizia.cloud"}/azienda/impostazioni/abbonamento"
           style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
          Attiva abbonamento
        </a>
      </div>
    </div>
  `;
}

async function hasRecentDunningEmail(companyId: string, emailType: string): Promise<boolean> {
  const { data } = await supabase
    .from("subscription_logs")
    .select("id")
    .eq("company_id", companyId)
    .eq("event_type", emailType)
    .gte("created_at", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()) // deduplicate within 2 days
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function logDunningEvent(companyId: string, eventType: string, notes: string) {
  await supabase.from("subscription_logs").insert({
    company_id: companyId,
    event_type: eventType,
    notes,
    performed_by: null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Sicurezza: richiede INTERNAL_CRON_SECRET via header x-cron-secret (SEC-003)
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || requestCronSecret !== cronSecret) {
    console.error("process-dunning: accesso non autorizzato");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const now = new Date();
  const results = { processed: 0, emails_sent: 0, suspended: 0, errors: 0 };

  try {
    const providerSettings = await loadProviderSettings("transactional").catch(() => null);

    // ── 1. Companies with expired subscriptions (grace period 0-14 days) ──
    const { data: expiredCompanies } = await supabase
      .from("companies")
      .select("id, name, email, status, subscription_plan_id")
      .in("status", ["active", "trial"])
      .not("subscription_plan_id", "is", null);

    for (const company of expiredCompanies || []) {
      try {
        // Check if they have an active subscription that has expired
        const { data: sub } = await supabase
          .from("company_subscriptions")
          .select("current_period_end, status")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!sub || sub.status === "active") continue;
        if (!sub.current_period_end) continue;

        const daysExpired = daysDiff(sub.current_period_end);
        if (daysExpired < 0 || daysExpired > 14) continue;

        results.processed++;

        // Auto-suspend at day 14
        if (daysExpired >= 14) {
          await supabase.from("companies").update({ status: "suspended" }).eq("id", company.id);
          await logDunningEvent(company.id, "dunning_suspended", "Account sospeso automaticamente dopo 14 giorni di mancato pagamento");
          results.suspended++;
          continue;
        }

        // Determine which email to send
        const emailType =
          daysExpired === 0 ? "dunning_day0" :
          daysExpired === 3 ? "dunning_day3" :
          daysExpired === 7 ? "dunning_day7" : null;

        if (!emailType) continue;
        if (await hasRecentDunningEmail(company.id, emailType)) continue;

        if (providerSettings && company.email) {
          const html = buildExpiredEmail(company, daysExpired);
          const subjects: Record<string, string> = {
            dunning_day0: "Il tuo abbonamento è scaduto",
            dunning_day3: "Rinnova il tuo abbonamento — accesso a rischio",
            dunning_day7: "⚠️ Ultimo avviso: account verrà sospeso tra 7 giorni",
          };
          await sendEmail(providerSettings, {
            from: providerSettings.fromAddress,
            to: [company.email],
            subject: subjects[emailType],
            html,
          });
          results.emails_sent++;
        }

        await logDunningEvent(company.id, emailType, `Email dunning inviata (giorno ${daysExpired})`);
      } catch (err) {
        console.error(`Dunning error for company ${company.id}:`, err);
        results.errors++;
      }
    }

    // ── 2. Companies with trial expiring / expired ──
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trialCompanies } = await supabase
      .from("companies")
      .select("id, name, email, trial_ends_at")
      .eq("status", "trial")
      .not("trial_ends_at", "is", null)
      .lte("trial_ends_at", threeDaysFromNow);

    for (const company of trialCompanies || []) {
      try {
        if (!company.trial_ends_at) continue;
        const daysLeft = daysUntil(company.trial_ends_at);
        results.processed++;

        const emailType = daysLeft <= 0 ? "trial_expired_email" : "trial_expiring_3d";
        if (await hasRecentDunningEmail(company.id, emailType)) continue;

        if (providerSettings && company.email) {
          const html = buildTrialEmail(company, daysLeft);
          await sendEmail(providerSettings, {
            from: providerSettings.fromAddress,
            to: [company.email],
            subject: daysLeft <= 0 ? "Il tuo periodo di prova è terminato" : `Il tuo trial scade tra ${daysLeft} giorni`,
            html,
          });
          results.emails_sent++;
        }

        await logDunningEvent(company.id, emailType, `Email trial ${daysLeft <= 0 ? "scaduto" : `scade tra ${daysLeft} giorni`} inviata`);
      } catch (err) {
        console.error(`Trial dunning error for company ${company.id}:`, err);
        results.errors++;
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-dunning fatal error:", err);
    return new Response(JSON.stringify({ error: String(err), ...results }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
