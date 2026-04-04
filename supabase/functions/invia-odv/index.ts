import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProvider } from "../_shared/emailProvider.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { odv_id } = await req.json();

    if (!odv_id) return errorResponse("odv_id richiesto");

    // Carica OdV
    const { data: odv, error: odvErr } = await supabaseAdmin
      .from("ordini_variazione")
      .select("*, order:orders(id, company_id, customer:profiles!orders_customer_id_fkey(full_name, email))")
      .eq("id", odv_id)
      .single();

    if (odvErr || !odv) return errorResponse("OdV non trovato", 404);

    // Verifica autorizzazione
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, full_name")
      .eq("id", userId)
      .single();

    if (!profile || profile.company_id !== odv.company_id) {
      return errorResponse("Non autorizzato", 403);
    }

    // Recupera dati azienda
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", odv.company_id)
      .single();

    const customerEmail = (odv.order as any)?.customer?.email;
    const customerName = (odv.order as any)?.customer?.full_name || "Cliente";

    if (!customerEmail) {
      return errorResponse("Il cliente non ha un indirizzo email configurato");
    }

    // Genera o riusa firma_token
    let firmaToken = odv.firma_token;
    if (!firmaToken) {
      firmaToken = crypto.randomUUID();
      await supabaseAdmin
        .from("ordini_variazione")
        .update({ firma_token: firmaToken, status: "in_attesa" })
        .eq("id", odv_id);
    } else {
      await supabaseAdmin
        .from("ordini_variazione")
        .update({ status: "in_attesa" })
        .eq("id", odv_id);
    }

    const domain = Deno.env.get("PUBLIC_SITE_URL") || "https://app.ediliziaincloud.com";
    const firmaUrl = `${domain}/firma-odv/${firmaToken}`;
    const aziendaNome = company?.name || "Edilizia in Cloud";

    // Carica configurazione email provider
    const providerSettings = await loadProviderSettings(supabaseAdmin, odv.company_id);

    const htmlBody = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1E3A5F; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">${aziendaNome}</h1>
  </div>
  <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0;">
    <p>Gentile ${customerName},</p>
    <p>Le inviamo in approvazione l'<strong>Ordine di Variazione #${odv.numero_odv}</strong>:</p>
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 8px 0; color: #1E3A5F;">${odv.titolo}</h3>
      <p style="margin: 0; color: #666; font-size: 14px;">${odv.descrizione}</p>
      ${odv.impatto_economico > 0 ? `<p style="margin: 12px 0 0 0; font-size: 18px; font-weight: bold; color: #E87722;">
        Importo variazione: €${Number(odv.impatto_economico).toFixed(2).replace('.', ',')}
      </p>` : ''}
    </div>
    <p>Per approvare o rifiutare questa variazione, clicchi sul pulsante qui sotto:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${firmaUrl}" style="background: #E87722; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        Visualizza e Firma OdV
      </a>
    </div>
    <p style="font-size: 12px; color: #888;">
      Se il pulsante non funziona, copi questo link nel browser:<br>
      <a href="${firmaUrl}" style="color: #1E3A5F;">${firmaUrl}</a>
    </p>
  </div>
  <div style="background: #f0f0f0; padding: 12px; border-radius: 0 0 8px 8px; text-align: center; font-size: 11px; color: #888;">
    ${aziendaNome} &bull; Gestito con Edilizia in Cloud
  </div>
</body>
</html>`;

    await sendViaProvider(providerSettings, {
      to: [{ email: customerEmail, name: customerName }],
      subject: `Approvazione richiesta: OdV #${odv.numero_odv} — ${odv.titolo} | ${aziendaNome}`,
      html: htmlBody,
      text: `Ordine di Variazione #${odv.numero_odv}: ${odv.titolo}\n\nFirma qui: ${firmaUrl}`,
    });

    return jsonResponse({ success: true, token: firmaToken, email_inviata_a: customerEmail });
  } catch (err: any) {
    console.error("[invia-odv]", err);
    return errorResponse(err.message || "Errore interno", 500);
  }
});
