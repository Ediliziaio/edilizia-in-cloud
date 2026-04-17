// send-nps-survey: triggered by pg_cron or internal call
// Sends NPS survey emails to eligible company admin users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const SURVEY_COOLDOWN_DAYS = 90; // min days between surveys
const TOKEN_EXPIRY_DAYS = 7;

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Internal only — cron secret required
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || requestSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...secureHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const appUrl = Deno.env.get("APP_URL") || "https://app.ediliziacloud.it";
    const now = new Date();
    const cooldownDate = new Date(now.getTime() - SURVEY_COOLDOWN_DAYS * 86400 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000);

    // Fetch active companies activated >= 30 days ago
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, created_at")
      .eq("status", "active")
      .lte("created_at", thirtyDaysAgo.toISOString());

    if (!companies?.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No eligible companies" }), {
        headers: { ...secureHeaders, "Content-Type": "application/json" },
      });
    }

    // Get companies that received a survey recently
    const { data: recentSurveys } = await supabase
      .from("nps_surveys")
      .select("company_id")
      .gte("sent_at", cooldownDate.toISOString());

    const recentSet = new Set((recentSurveys || []).map((s: any) => s.company_id));

    let sent = 0;
    const errors: string[] = [];

    for (const company of companies) {
      if (recentSet.has(company.id)) continue;

      // Get company admin user
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .eq("company_id", company.id)
        .limit(1)
        .maybeSingle();

      if (!adminProfile?.email) continue;

      // Create survey record with token
      const token = generateToken();
      const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_DAYS * 86400 * 1000).toISOString();

      const daysSinceCreation = Math.floor((now.getTime() - new Date(company.created_at).getTime()) / 86400000);
      const triggerEvent = daysSinceCreation <= 35 ? "first_month" : "quarterly";

      const { error: insertError } = await supabase.from("nps_surveys").insert({
        company_id: company.id,
        user_id: adminProfile.id,
        token,
        trigger_event: triggerEvent,
        sent_at: now.toISOString(),
        expires_at: expiresAt,
      });

      if (insertError) {
        errors.push(`${company.id}: ${insertError.message}`);
        // Log fallimento
        await (supabase
          .from("nps_send_log" as never)
          .insert({ company_id: company.id, day_offset: daysSinceCreation <= 35 ? 30 : 90, status: "failed", error_message: insertError.message } as never) as unknown as Promise<void>);
        continue;
      }

      const surveyUrl = `${appUrl}/feedback/nps?token=${token}`;
      const firstName = adminProfile.first_name || "Admin";

      // Send email via unified pipeline
      try {
        await sendEmailUnified({
          companyId:    company.id,
          stream:       "transactional",
          to:           adminProfile.email,
          subject:      `Come valuti Edilizia in Cloud? (2 minuti)`,
          html: `
              <p>Ciao ${firstName},</p>
              <p>Usi Edilizia in Cloud da un po' di tempo e vorremmo sapere la tua opinione.</p>
              <p>In soli 2 minuti puoi aiutarci a migliorare il servizio:</p>
              <p style="text-align:center;margin:24px 0;">
                <a href="${surveyUrl}" style="background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
                  Dai il tuo feedback
                </a>
              </p>
              <p style="color:#6B7280;font-size:12px;">Il link scade il ${new Date(expiresAt).toLocaleDateString("it-IT")}.</p>
            `,
          templateName: "nps_survey",
          skipCredits:  true,
          adminClient:  supabase,
          metadata:     { trigger_event: triggerEvent, token },
        });
        sent++;

        // Aggiorna flag nps_sent_30d/90d e audit log
        const dayOffset = daysSinceCreation <= 35 ? 30 : 90;
        const flagUpdate = dayOffset === 30
          ? { nps_sent_30d: true, nps_sent_at: now.toISOString() }
          : { nps_sent_90d: true, nps_sent_at: now.toISOString() };

        await Promise.all([
          supabase.from("companies").update(flagUpdate).eq("id", company.id),
          (supabase
            .from("nps_send_log" as never)
            .insert({ company_id: company.id, day_offset: dayOffset, status: "sent" } as never) as unknown as Promise<void>),
        ]);
      } catch (emailErr) {
        errors.push(`Email error for ${adminProfile.email}: ${(emailErr as Error).message}`);
        await (supabase
          .from("nps_send_log" as never)
          .insert({ company_id: company.id, day_offset: daysSinceCreation <= 35 ? 30 : 90, status: "failed", error_message: (emailErr as Error).message } as never) as unknown as Promise<void>);
      }
    }

    return new Response(
      JSON.stringify({ sent, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...secureHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-nps-survey error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...secureHeaders, "Content-Type": "application/json" } }
    );
  }
});
