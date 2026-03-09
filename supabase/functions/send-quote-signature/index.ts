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
    const { quote_id } = await req.json();

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

    if (!quote.client_email) {
      return errorResponse("Il cliente non ha un indirizzo email");
    }

    // Generate signature token if not present
    let signatureToken = quote.signature_token;
    if (!signatureToken) {
      signatureToken = crypto.randomUUID();
    }

    // Update quote status to inviata and set token
    await supabaseAdmin
      .from("quotes")
      .update({
        status: "inviata",
        signature_token: signatureToken,
        sent_at: new Date().toISOString(),
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

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h1 style="margin: 0 0 8px; font-size: 22px; color: #18181b;">${companyName}</h1>
      <p style="margin: 0 0 30px; color: #71717a; font-size: 14px;">Offerta n. ${quote.quote_number}</p>

      <p style="color: #3f3f46; line-height: 1.6; margin-bottom: 15px;">
        Gentile <strong>${quote.client_name || "Cliente"}</strong>,
      </p>
      <p style="color: #3f3f46; line-height: 1.6; margin-bottom: 15px;">
        Le inviamo in allegato la nostra offerta${quote.title ? ` per <strong>${quote.title}</strong>` : ""}.
      </p>
      <p style="color: #3f3f46; line-height: 1.6; margin-bottom: 25px;">
        Importo totale: <strong>€ ${(quote.total || 0).toFixed(2)}</strong>
      </p>

      ${quote.valid_until ? `
        <p style="color: #71717a; font-size: 13px; margin-bottom: 25px;">
          Offerta valida fino al ${new Date(quote.valid_until).toLocaleDateString("it-IT")}
        </p>
      ` : ""}

      <div style="text-align: center; margin: 30px 0;">
        <a href="${signatureLink}" 
           style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Visualizza e Firma l'Offerta
        </a>
      </div>

      <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 20px;">
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
        to: [quote.client_email],
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
