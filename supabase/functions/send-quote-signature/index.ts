import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProvider } from "../_shared/emailProvider.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    const {
      quote_id,
      recipient_email,
      recipient_name,
      custom_message,
      expires_days,
    } = await req.json();

    if (!quote_id) return errorResponse("quote_id richiesto");

    // Load quote
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (qErr || !quote) return errorResponse("Preventivo non trovato", 404);

    // Verify user belongs to company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    if (!profile || profile.company_id !== quote.company_id) {
      return errorResponse("Non autorizzato", 403);
    }

    // Determine recipient
    const finalEmail = recipient_email || quote.client_email;
    const finalName = recipient_name || quote.client_name || "Cliente";

    if (!finalEmail) {
      return errorResponse("Il cliente non ha un indirizzo email");
    }

    // Generate signature token if not present
    let signatureToken = quote.signature_token;
    if (!signatureToken) {
      signatureToken = crypto.randomUUID();
    }

    // Calculate expires_at
    const daysValid = expires_days && expires_days > 0 ? expires_days : 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysValid);

    // Update quote
    await supabaseAdmin
      .from("quotes")
      .update({
        status: "inviata",
        signature_token: signatureToken,
        sent_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        client_email: finalEmail,
        client_name: finalName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quote_id);

    // Build signature link
    const appUrl = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "https://edilizia-in-cloud.lovable.app";
    const signatureLink = `${appUrl}/offerta/${signatureToken}`;

    // Load company info
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, logo_url")
      .eq("id", quote.company_id)
      .single();

    const companyName = company?.name || "L'azienda";

    // Format total
    const formattedTotal = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(Number(quote.total || 0));

    const expiresFormatted = expiresAt.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="background: #1e3a5f; border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
      ${company?.logo_url ? `<img src="${company.logo_url}" alt="${companyName}" style="height: 48px; margin-bottom: 12px;" />` : ""}
      <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700;">${companyName}</h1>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.75); font-size: 14px;">Offerta n. ${quote.quote_number}</p>
    </div>

    <!-- Body -->
    <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e4e4e7; border-right: 1px solid #e4e4e7;">
      <p style="color: #3f3f46; line-height: 1.6; margin: 0 0 15px;">
        Gentile <strong>${finalName}</strong>,
      </p>
      <p style="color: #3f3f46; line-height: 1.6; margin: 0 0 15px;">
        Le inviamo la nostra offerta${quote.title ? ` per <strong>${quote.title}</strong>` : ""}.
      </p>

      ${custom_message ? `
        <div style="background: #f8fafc; border-left: 3px solid #2563eb; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="color: #3f3f46; line-height: 1.6; margin: 0; font-size: 14px;">${custom_message}</p>
        </div>
      ` : ""}

      <!-- Amount box -->
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; text-align: center; margin: 25px 0;">
        <p style="color: #71717a; font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">Importo Totale</p>
        <p style="color: #1e3a5f; font-size: 28px; font-weight: 700; margin: 0;">${formattedTotal}</p>
      </div>

      <p style="color: #71717a; font-size: 13px; margin: 0 0 25px; text-align: center;">
        Offerta valida fino al <strong>${expiresFormatted}</strong>
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${signatureLink}" 
           style="display: inline-block; background: #2563eb; color: #ffffff; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Visualizza e Firma l'Offerta
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 20px 0 0;">
        Oppure copia questo link nel browser:<br />
        <a href="${signatureLink}" style="color: #2563eb; word-break: break-all;">${signatureLink}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #fafafa; border-radius: 0 0 12px 12px; padding: 20px 40px; border: 1px solid #e4e4e7; border-top: none; text-align: center;">
      <p style="color: #a1a1aa; font-size: 11px; margin: 0;">
        Questa email è stata inviata da ${companyName} tramite Edilizia in Cloud.
      </p>
    </div>
  </div>
</body>
</html>`;

    // Send email via configured provider (transactional stream)
    const settings = await loadProviderSettings("transactional");

    if (!settings.apiKey) {
      return errorResponse("Provider email transazionale non configurato. Configura le impostazioni email.");
    }

    const result = await sendViaProvider(
      settings.provider,
      settings.apiKey,
      {
        from: settings.fromDefault,
        to: [finalEmail],
        subject: `Offerta ${quote.quote_number} — ${companyName}`,
        html: emailHtml,
      },
      { domain: settings.domain }
    );

    if (!result.ok) {
      console.error("Email send failed:", result);
      return errorResponse(`Errore invio email: ${JSON.stringify(result.body)}`, 500);
    }

    return jsonResponse({
      success: true,
      message: "Offerta inviata con successo",
      signature_link: signatureLink,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("send-quote-signature error:", e);
    return errorResponse("Errore interno", 500);
  }
});
