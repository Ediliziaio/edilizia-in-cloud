import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/**
 * Item 18: Branded reset-password email.
 * Replaces the default Supabase reset email with a branded HTML email
 * that uses the company's (or platform's) branding settings.
 *
 * Called by the LoginForm "password dimenticata" flow — no auth required
 * since the user is not logged in yet.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { email, redirect_to } = await req.json();
    if (!email) return errorResponse("email richiesta");

    // Look up the user by email to find their company branding
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, first_name")
      .eq("email", email)
      .maybeSingle();

    // Load company branding if available
    let platformName = "Edilizia in Cloud";
    let primaryColor = "#F97415";
    let logoUrl: string | null = null;

    if (profile?.company_id) {
      const { data: branding } = await supabaseAdmin
        .from("company_branding")
        .select("platform_name, login_logo_url, logo_url, primary_color")
        .eq("company_id", profile.company_id)
        .maybeSingle();

      if (branding) {
        platformName = (branding as any).platform_name || platformName;
        primaryColor = (branding as any).primary_color || primaryColor;
        logoUrl = (branding as any).login_logo_url || (branding as any).logo_url || null;
      }
    }

    // Generate a password recovery link using the Supabase admin API
    const siteUrl = redirect_to || Deno.env.get("SITE_URL") || "https://app.ediliziacloud.it";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkError);
      // Return success anyway to avoid email enumeration
      return jsonResponse({ success: true });
    }

    const resetUrl = linkData.properties.action_link;
    const firstName = profile?.first_name || "";

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#0f172a;padding:24px 32px;text-align:center;">
  ${logoUrl ? `<img src="${logoUrl}" alt="${platformName}" style="height:40px;max-width:200px;object-fit:contain;" />` : `<span style="color:#ffffff;font-size:20px;font-weight:700;">${platformName}</span>`}
</td></tr>
<tr><td style="padding:32px;">
  <h2 style="color:#0f172a;font-size:22px;margin:0 0 16px;">Reimposta la tua password</h2>
  ${firstName ? `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Ciao ${firstName},</p>` : ""}
  <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
    Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account.
    Clicca il pulsante qui sotto per creare una nuova password.
  </p>
  <table width="100%"><tr><td style="text-align:center;padding-bottom:24px;">
    <a href="${resetUrl}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
      Reimposta Password
    </a>
  </td></tr></table>
  <p style="color:#94a3b8;font-size:13px;margin:0;">
    Questo link scade tra 24 ore. Se non hai richiesto il reset della password, puoi ignorare questa email.
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">
    Oppure copia questo URL nel browser:<br>
    <span style="word-break:break-all;">${resetUrl}</span>
  </p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
  <p style="color:#94a3b8;font-size:12px;margin:0;">Questo è un messaggio automatico di ${platformName}. Non rispondere a questa email.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

    const settings = await loadProviderSettings("transactional");
    if (settings.apiKey) {
      await sendViaProvider(settings.provider, settings.apiKey, {
        from: settings.fromDefault || settings.fromEmail,
        to: [email],
        subject: `Reimposta la password di ${platformName}`,
        html: emailHtml,
      }, { domain: settings.domain || undefined });
    } else {
      // Fallback: use Supabase native reset (just trigger the link, email already sent by generateLink)
      console.warn("No transactional email provider configured, reset link generated but not sent via custom email");
    }

    return jsonResponse({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("reset-password-branded error:", err);
    // Always return success to avoid email enumeration
    return jsonResponse({ success: true });
  }
});
