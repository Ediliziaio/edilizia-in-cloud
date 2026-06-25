import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";

const PARTNER_BASE = "https://app.ediliziaincloud.com/partner";
// type evento → template_key del builder (platform_email_templates / SYSTEM_EMAIL_CONTENT)
const PARTNER_KEY_BY_TYPE: Record<string, string> = {
  welcome: "partner_welcome",
  conversion: "partner_conversion",
  commission_calculated: "partner_commission",
  payout_approved: "partner_payout",
  tier_upgrade: "partner_tier",
};

const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : String(err);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Sicurezza: questa funzione usa service_role — richiede cron secret o chiamata interna
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || requestSecret !== cronSecret) {
    console.error("send-partner-notification: accesso non autorizzato");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { type, referrer_id, data } = await req.json();

    if (!type || !referrer_id) {
      return errorResponse("type and referrer_id required");
    }

    // Fetch referrer with tier
    const { data: referrer, error: refErr } = await supabase
      .from("referrers")
      .select("*, referral_tiers(*)")
      .eq("id", referrer_id)
      .single();

    if (refErr || !referrer) {
      return errorResponse("Referrer not found", 404);
    }

    const tplKey = PARTNER_KEY_BY_TYPE[type as string];
    if (!tplKey) {
      return errorResponse(`Unknown notification type: ${type}`);
    }

    // Etichetta commissione formattata (percentuale o importo fisso)
    const commissioneLabel = referrer.commission_type === "percentage"
      ? `${referrer.commission_value}% del piano mensile`
      : `€${referrer.commission_value} fissi al mese`;

    // Props camelCase: gli alias di applyPlaceholders li mappano sui {{var}} del builder.
    const partnerVarsByType: Record<string, Record<string, unknown>> = {
      welcome: {
        fullName: referrer.name,
        tier: referrer.referral_tiers?.name ?? "Bronze",
        referralCode: referrer.referral_code,
        commissionLabel,
        ctaUrl: PARTNER_BASE,
      },
      conversion: {
        fullName: referrer.name,
        companyName: data?.company_name,
        ctaUrl: PARTNER_BASE,
      },
      commission_calculated: {
        fullName: referrer.name,
        month: data?.month_name,
        totalAmount: `€${data?.total_amount}`,
        companyCount: data?.company_count,
        ctaUrl: `${PARTNER_BASE}/commissions`,
      },
      payout_approved: {
        fullName: referrer.name,
        amount: `€${data?.amount}`,
        reference: data?.reference ?? "In elaborazione",
      },
      tier_upgrade: {
        fullName: referrer.name,
        newTier: data?.new_tier,
        multiplier: data?.multiplier,
        ctaUrl: PARTNER_BASE,
      },
    };

    const rendered = await renderEmailTemplate({
      templateName: tplKey,
      companyId: null,
      props: partnerVarsByType[type as string] ?? {},
      adminClient: supabase,
    });
    const subject = rendered.subject;
    const htmlBody = rendered.html;

    // Get platform email settings
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email", "smtp_from_name"]);

    const settings: Record<string, string> = {};
    platformSettings?.forEach((s: any) => {
      settings[s.key] = s.value;
    });

    if (settings.smtp_host && settings.smtp_user && settings.smtp_pass) {
      console.log("[partner-notification] Sending partner email", { type, referrer_id });

      await sendEmailUnified({
        companyId:    null,
        stream:       "transactional",
        to:           referrer.email,
        subject,
        html:         htmlBody,
        templateName: "partner_notification",
        skipCredits:  true,
        adminClient:  supabase,
        metadata:     { type, referrer_id },
      });
    } else {
      console.log("[partner-notification] SMTP not configured, skipping partner email", { type, referrer_id });
    }

    return jsonResponse({ success: true, type, referrer_email: referrer.email });
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error("[partner-notification] Error:", message);
    return errorResponse(message || "Internal error", 500);
  }
});

// redeploy 2026-06-25: propaga _shared email/branding (.it→.com + builder 58 email) — trigger CI HEAD~1 diff
