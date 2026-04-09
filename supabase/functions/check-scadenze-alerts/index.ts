import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Sicurezza: funzione cron — richiede cron secret
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || requestSecret !== cronSecret) {
    console.error("check-scadenze-alerts: accesso non autorizzato");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all companies with alert prefs enabled
    const { data: prefs, error: prefsErr } = await supabase
      .from("scadenza_alert_prefs")
      .select("*")
      .eq("alert_enabled", true);

    if (prefsErr) throw prefsErr;

    // Load email provider settings once (transactional stream, fallback to marketing)
    let emailSettings = await loadProviderSettings("transactional");
    if (!emailSettings.apiKey) {
      emailSettings = await loadProviderSettings("marketing");
    }

    const results: { company_id: string; overdue: number; upcoming: number; alerts_sent: number; email_sent: boolean }[] = [];

    for (const pref of (prefs || [])) {
      // Get overdue and upcoming scadenze
      const { data: checkResult, error: checkErr } = await supabase.rpc(
        "check_overdue_and_upcoming_scadenze",
        { p_company_id: pref.company_id }
      );

      if (checkErr) {
        console.error(`Error checking scadenze for ${pref.company_id}:`, checkErr);
        continue;
      }

      const result = checkResult as any;
      let alertsSent = 0;
      let emailSent = false;

      // Mark upcoming scadenze as alerted
      if (result.upcoming && result.upcoming.length > 0) {
        const ids = result.upcoming.map((s: any) => s.id);
        await supabase
          .from("scadenze")
          .update({ alert_sent_at: new Date().toISOString() })
          .in("id", ids);
        alertsSent = ids.length;
      }

      // Send email notification if configured and there are alerts
      if (pref.alert_email && emailSettings.apiKey && (result.overdue_count > 0 || alertsSent > 0)) {
        try {
          const overdueCount: number = result.overdue_count || 0;
          const upcomingItems: any[] = result.upcoming || [];

          // Build email HTML
          let emailHtml = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a1a2e;">⏰ Promemoria Scadenze</h2>`;

          if (overdueCount > 0) {
            emailHtml += `
  <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <strong style="color: #dc2626;">⚠️ ${overdueCount} scadenz${overdueCount === 1 ? "a scaduta" : "e scadute"}</strong>
    <p style="margin: 4px 0 0; color: #7f1d1d;">Hai scadenze già superate che richiedono attenzione immediata.</p>
  </div>`;
          }

          if (upcomingItems.length > 0) {
            emailHtml += `
  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <strong style="color: #d97706;">📅 ${upcomingItems.length} scadenz${upcomingItems.length === 1 ? "a in arrivo" : "e in arrivo"}</strong>
    <ul style="margin: 8px 0 0; padding-left: 20px; color: #78350f;">`;

            for (const s of upcomingItems.slice(0, 10)) {
              const dueDate = s.data_scadenza
                ? new Date(s.data_scadenza).toLocaleDateString("it-IT")
                : "";
              emailHtml += `<li>${s.descrizione || "Scadenza"} — ${dueDate}</li>`;
            }

            if (upcomingItems.length > 10) {
              emailHtml += `<li><em>... e altre ${upcomingItems.length - 10}</em></li>`;
            }

            emailHtml += `</ul></div>`;
          }

          const branding = await getBrandingForCompany(supabase, pref.company_id);
          const siteUrl = branding.siteUrl;
          emailHtml += `
  <p style="margin-top: 24px;">
    <a href="${siteUrl}/scadenze" style="background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      Vai alle Scadenze →
    </a>
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
    Hai ricevuto questa email perché hai abilitato gli avvisi scadenze su ${branding.platformName}.
  </p>
</div>`;

          const emailSubject = overdueCount > 0
            ? `⚠️ ${overdueCount} scadenz${overdueCount === 1 ? "a scaduta" : "e scadute"} — azione richiesta`
            : `📅 ${alertsSent} scadenz${alertsSent === 1 ? "a in arrivo" : "e in arrivo"} — promemoria`;

          const sendResult = await sendViaProvider(emailSettings.provider, emailSettings.apiKey, {
            from: emailSettings.fromDefault,
            to: [pref.alert_email],
            subject: emailSubject,
            html: emailHtml,
          });

          if (sendResult.ok) {
            emailSent = true;
            console.log(`Alert email sent to ${pref.alert_email} for company ${pref.company_id}`);
          } else {
            console.error(`Failed to send alert email to ${pref.alert_email}:`, sendResult.body);
          }
        } catch (emailErr) {
          console.error(`Email sending error for company ${pref.company_id}:`, emailErr);
        }
      } else if (pref.alert_email && (result.overdue_count > 0 || alertsSent > 0)) {
        // No email provider configured — just log
        console.log(
          `Company ${pref.company_id}: ${result.overdue_count} overdue, ${alertsSent} upcoming alerts — email provider not configured`
        );
      }

      results.push({
        company_id: pref.company_id,
        overdue: result.overdue_count || 0,
        upcoming: alertsSent,
        alerts_sent: alertsSent,
        email_sent: emailSent,
      });
    }

    return jsonResponse({
      message: "Scadenze alerts check completed",
      companies_checked: results.length,
      results,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("check-scadenze-alerts error:", err);
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
});
