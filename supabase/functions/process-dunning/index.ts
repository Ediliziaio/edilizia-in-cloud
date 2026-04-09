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
 *
 * Retry logic:
 *   On failure: retry after 2h, up to 3 attempts
 *   After 3 failures: permanently_failed=true, notify super_admin
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendEmail } from "../_shared/emailProvider.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
const SUPPORT_PHONE = "+39 0424 123456";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function daysDiff(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(date: string): number {
  return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Email Templates ────────────────────────────────────────────────────────

function emailHeader(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:20px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr><td style="background:#1e40af;padding:24px 32px;">
            <p style="margin:0;font-family:sans-serif;font-size:20px;font-weight:bold;color:#fff;letter-spacing:-0.5px;">
              EDILIZIA IN CLOUD
            </p>
            <p style="margin:4px 0 0;font-family:sans-serif;font-size:13px;color:#bfdbfe;">
              La piattaforma per l'edilizia italiana
            </p>
          </td></tr>
          <tr><td style="padding:32px;">
  `;
}

function emailFooter(utmCampaign: string): string {
  return `
          </td></tr>
          <tr><td style="background:#f1f5f9;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-family:sans-serif;font-size:13px;color:#64748b;line-height:1.6;">
              Hai bisogno di aiuto? Chiama <strong>${SUPPORT_PHONE}</strong> o rispondi a questa email.<br>
              <a href="${APP_URL}/azienda/supporto?utm_source=dunning&utm_medium=email&utm_campaign=${utmCampaign}"
                 style="color:#1e40af;">Apri ticket di supporto</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  `;
}

function buildExpiredEmail(company: any, daysExpired: number, _dunningDay: string): string {
  const utmCampaign = `day_${daysExpired}`;
  const renewUrl = `${APP_URL}/azienda/impostazioni/abbonamento?utm_source=dunning&utm_medium=email&utm_campaign=${utmCampaign}`;

  const urgencyBlock =
    daysExpired >= 7
      ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;font-family:sans-serif;font-size:15px;font-weight:bold;color:#dc2626;">Ultimo avviso: il tuo account verra' sospeso tra ${14 - daysExpired} giorni.</p></div>`
      : daysExpired >= 3
      ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;font-family:sans-serif;font-size:15px;font-weight:bold;color:#ea580c;">Il tuo accesso verra' sospeso tra ${14 - daysExpired} giorni se non rinnovi.</p></div>`
      : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;font-family:sans-serif;font-size:15px;color:#1e40af;">Il tuo abbonamento e' scaduto. Rinnova ora per continuare senza interruzioni.</p></div>`;

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){table{width:100%!important}td{padding:16px!important}}</style></head><body style="margin:0;padding:0;background:#f8fafc;">
    ${emailHeader()}
    <h2 style="margin:0 0 8px;font-family:sans-serif;font-size:22px;font-weight:bold;color:#111827;">Abbonamento scaduto</h2>
    <p style="margin:0 0 4px;font-family:sans-serif;font-size:14px;color:#6b7280;">Account: <strong>${company.name}</strong></p>
    ${urgencyBlock}
    <p style="font-family:sans-serif;font-size:15px;color:#374151;line-height:1.6;">Il tuo abbonamento e' scaduto da <strong>${daysExpired} ${daysExpired === 1 ? "giorno" : "giorni"}</strong>. Per continuare ad usare tutti i servizi senza interruzioni, effettua il rinnovo.</p>
    <div style="text-align:center;margin:32px 0;"><a href="${renewUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:16px;">Rinnova abbonamento</a></div>
    ${emailFooter(utmCampaign)}
    </body></html>`;
}

function buildTrialEmail(company: any, daysLeft: number): string {
  const utmCampaign = daysLeft <= 0 ? "trial_expired" : "trial_expiring_3d";
  const ctaUrl = `${APP_URL}/azienda/impostazioni/abbonamento?utm_source=dunning&utm_medium=email&utm_campaign=${utmCampaign}`;

  const content = daysLeft <= 0
    ? `<h2 style="margin:0 0 16px;font-family:sans-serif;font-size:22px;font-weight:bold;color:#111827;">Il tuo periodo di prova e' terminato</h2>
       <p style="font-family:sans-serif;font-size:15px;color:#374151;line-height:1.6;">Il periodo di prova gratuito di <strong>${company.name}</strong> e' terminato. Scegli il piano piu' adatto.</p>
       <div style="text-align:center;margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:16px;">Scegli un piano</a></div>`
    : `<h2 style="margin:0 0 16px;font-family:sans-serif;font-size:22px;font-weight:bold;color:#111827;">Il tuo trial scade tra ${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}</h2>
       <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:0 0 20px;"><p style="margin:0;font-family:sans-serif;font-size:15px;color:#92400e;">Mancano solo <strong>${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}</strong> alla scadenza del tuo periodo di prova.</p></div>
       <p style="font-family:sans-serif;font-size:15px;color:#374151;line-height:1.6;">Non perdere l'accesso alle tue funzionalita' — attiva subito il tuo abbonamento.</p>
       <div style="text-align:center;margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:16px;">Attiva abbonamento</a></div>`;

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){table{width:100%!important}td{padding:16px!important}}</style></head><body style="margin:0;padding:0;background:#f8fafc;">
    ${emailHeader()}${content}${emailFooter(utmCampaign)}</body></html>`;
}

// ─── Retry Helpers ──────────────────────────────────────────────────────────

async function hasAlreadySent(companyId: string, dunningDay: string): Promise<boolean> {
  const { data } = await supabase
    .from("dunning_attempts")
    .select("id")
    .eq("company_id", companyId)
    .eq("dunning_day", dunningDay)
    .eq("status", "sent")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function getPendingRetries(): Promise<any[]> {
  const { data } = await supabase
    .from("dunning_attempts")
    .select("*")
    .eq("status", "failed")
    .eq("permanently_failed", false)
    .lte("next_retry_at", new Date().toISOString())
    .limit(50);
  return data || [];
}

async function logDunningAttempt(
  companyId: string, dunningDay: string, status: "sent" | "failed" | "skipped",
  errorMessage?: string, retryCount = 0
) {
  const now = new Date();
  const nextRetryAt = status === "failed" && retryCount < MAX_RETRIES
    ? new Date(now.getTime() + RETRY_DELAY_MS).toISOString() : null;
  await supabase.from("dunning_attempts").insert({
    company_id: companyId, dunning_day: dunningDay,
    sent_at: status === "sent" ? now.toISOString() : null,
    status, error_message: errorMessage ?? null, retry_count: retryCount,
    next_retry_at: nextRetryAt,
    permanently_failed: status === "failed" && retryCount >= MAX_RETRIES,
  });
}

async function updateDunningAttempt(id: string, status: "sent" | "failed", errorMessage?: string, retryCount = 0) {
  const now = new Date();
  const nextRetryAt = status === "failed" && retryCount < MAX_RETRIES
    ? new Date(now.getTime() + RETRY_DELAY_MS).toISOString() : null;
  await supabase.from("dunning_attempts").update({
    status, sent_at: status === "sent" ? now.toISOString() : null,
    error_message: errorMessage ?? null, retry_count: retryCount,
    next_retry_at: nextRetryAt,
    permanently_failed: status === "failed" && retryCount >= MAX_RETRIES,
  }).eq("id", id);
}

async function logDunningEvent(companyId: string, eventType: string, notes: string) {
  await supabase.from("subscription_logs").insert({ company_id: companyId, event_type: eventType, notes, performed_by: null });
}

async function notifySuperAdmin(providerSettings: any, companyId: string, companyName: string, dunningDay: string, errorMessage: string) {
  try {
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin").limit(3);
    if (!admins?.length) return;
    const { data: profiles } = await supabase.from("profiles").select("email").in("id", admins.map((a: any) => a.user_id));
    const adminEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
    if (!adminEmails.length) return;
    await sendEmail(providerSettings, {
      from: providerSettings.fromAddress, to: adminEmails,
      subject: `Dunning fallita permanentemente — ${companyName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h2 style="color:#dc2626;">Email Dunning Fallita</h2><p>Dopo ${MAX_RETRIES} tentativi, la email dunning per <strong>${companyName}</strong> (${dunningDay}) non e' stata inviata.</p><p>Errore: <code>${errorMessage}</code></p><p><a href="${APP_URL}/admin/aziende/${companyId}">Vai all'azienda</a></p></div>`,
    });
  } catch (err) {
    console.error("[dunning] Failed to notify super admin:", err);
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const corsH = getCorsHeaders(req);
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || requestCronSecret !== cronSecret) {
    console.error("process-dunning: accesso non autorizzato");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
  }

  const now = new Date();
  const results = { processed: 0, emails_sent: 0, suspended: 0, errors: 0, retries_processed: 0 };

  try {
    const providerSettings = await loadProviderSettings("transactional").catch(() => null);

    // ── Process pending retries first ──────────────────────────────────────
    if (providerSettings) {
      const pendingRetries = await getPendingRetries();
      for (const attempt of pendingRetries) {
        results.retries_processed++;
        try {
          const { data: company } = await supabase
            .from("companies").select("id, name, email, trial_ends_at, subscription_plan_id")
            .eq("id", attempt.company_id).maybeSingle();

          if (!company?.email) {
            await updateDunningAttempt(attempt.id, "failed", "Company or email not found", attempt.retry_count + 1);
            continue;
          }

          let html: string;
          let subject: string;

          if (attempt.dunning_day.startsWith("trial_")) {
            const daysLeft = company.trial_ends_at ? daysUntil(company.trial_ends_at) : 0;
            html = buildTrialEmail(company, daysLeft);
            subject = daysLeft <= 0 ? "Il tuo periodo di prova e' terminato" : `Il tuo trial scade tra ${daysLeft} giorni`;
          } else {
            const { data: sub } = await supabase.from("company_subscriptions")
              .select("current_period_end").eq("company_id", company.id)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            const daysExpired = sub?.current_period_end ? daysDiff(sub.current_period_end) : 0;
            html = buildExpiredEmail(company, daysExpired, attempt.dunning_day);
            const subjects: Record<string, string> = {
              dunning_day0: "Il tuo abbonamento e' scaduto",
              dunning_day3: "Rinnova il tuo abbonamento — accesso a rischio",
              dunning_day7: "Ultimo avviso: account verra' sospeso tra 7 giorni",
            };
            subject = subjects[attempt.dunning_day] || "Abbonamento — azione richiesta";
          }

          await sendEmail(providerSettings, { from: providerSettings.fromAddress, to: [company.email], subject, html });
          await updateDunningAttempt(attempt.id, "sent", undefined, attempt.retry_count);
          results.emails_sent++;
        } catch (retryErr) {
          const errMsg = (retryErr as Error).message;
          const newRetryCount = attempt.retry_count + 1;
          await updateDunningAttempt(attempt.id, "failed", errMsg, newRetryCount);
          results.errors++;
          if (newRetryCount >= MAX_RETRIES) {
            const { data: co } = await supabase.from("companies").select("id, name").eq("id", attempt.company_id).maybeSingle();
            await notifySuperAdmin(providerSettings, attempt.company_id, co?.name || "Sconosciuto", attempt.dunning_day, errMsg);
          }
        }
      }
    }

    // ── 1. Companies with expired subscriptions (grace period 0-14 days) ──
    const { data: expiredCompanies } = await supabase
      .from("companies").select("id, name, email, status, subscription_plan_id")
      .in("status", ["active", "trial"]).not("subscription_plan_id", "is", null);

    for (const company of expiredCompanies || []) {
      try {
        const { data: sub } = await supabase.from("company_subscriptions")
          .select("current_period_end, status").eq("company_id", company.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        if (!sub || sub.status === "active") continue;
        if (!sub.current_period_end) continue;

        const daysExpired = daysDiff(sub.current_period_end);
        if (daysExpired < 0 || daysExpired > 14) continue;

        results.processed++;

        if (daysExpired >= 14) {
          await supabase.from("companies").update({ status: "suspended" }).eq("id", company.id);
          await logDunningEvent(company.id, "dunning_suspended", "Account sospeso automaticamente dopo 14 giorni di mancato pagamento");
          results.suspended++;
          if (providerSettings) {
            await notifySuperAdmin(providerSettings, company.id, company.name, "auto_suspension",
              "Account sospeso automaticamente dopo 14 giorni di mancato pagamento");
          }
          continue;
        }

        const emailType =
          daysExpired === 0 ? "dunning_day0" :
          daysExpired === 3 ? "dunning_day3" :
          daysExpired === 7 ? "dunning_day7" : null;

        if (!emailType) continue;
        if (await hasAlreadySent(company.id, emailType)) continue;

        if (providerSettings && company.email) {
          const html = buildExpiredEmail(company, daysExpired, emailType);
          const subjects: Record<string, string> = {
            dunning_day0: "Il tuo abbonamento e' scaduto",
            dunning_day3: "Rinnova il tuo abbonamento — accesso a rischio",
            dunning_day7: "Ultimo avviso: account verra' sospeso tra 7 giorni",
          };
          try {
            await sendEmail(providerSettings, { from: providerSettings.fromAddress, to: [company.email], subject: subjects[emailType], html });
            await logDunningAttempt(company.id, emailType, "sent");
            results.emails_sent++;
          } catch (emailErr) {
            const errMsg = (emailErr as Error).message;
            console.error(`[dunning] Email send failed for company ${company.id} (${emailType}):`, errMsg);
            await logDunningAttempt(company.id, emailType, "failed", errMsg, 1);
            results.errors++;
          }
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
      .from("companies").select("id, name, email, trial_ends_at").eq("status", "trial")
      .not("trial_ends_at", "is", null).lte("trial_ends_at", threeDaysFromNow);

    for (const company of trialCompanies || []) {
      try {
        if (!company.trial_ends_at) continue;
        const daysLeft = daysUntil(company.trial_ends_at);
        results.processed++;

        const emailType = daysLeft <= 0 ? "trial_expired_email" : "trial_expiring_3d";
        if (await hasAlreadySent(company.id, emailType)) continue;

        if (providerSettings && company.email) {
          const html = buildTrialEmail(company, daysLeft);
          try {
            await sendEmail(providerSettings, {
              from: providerSettings.fromAddress, to: [company.email],
              subject: daysLeft <= 0 ? "Il tuo periodo di prova e' terminato" : `Il tuo trial scade tra ${daysLeft} giorni`,
              html,
            });
            await logDunningAttempt(company.id, emailType, "sent");
            results.emails_sent++;
          } catch (emailErr) {
            const errMsg = (emailErr as Error).message;
            console.error(`[dunning] Trial email send failed for company ${company.id} (${emailType}):`, errMsg);
            await logDunningAttempt(company.id, emailType, "failed", errMsg, 1);
            results.errors++;
          }
        }
        await logDunningEvent(company.id, emailType, `Email trial ${daysLeft <= 0 ? "scaduto" : `scade tra ${daysLeft} giorni`} inviata`);
      } catch (err) {
        console.error(`Trial dunning error for company ${company.id}:`, err);
        results.errors++;
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-dunning fatal error:", err);
    return new Response(JSON.stringify({ error: String(err), ...results }), {
      status: 500, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }
});
