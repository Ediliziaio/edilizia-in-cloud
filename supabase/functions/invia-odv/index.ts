import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { pendingVariation, escapeVariationHtml, variationEmailAmount } from "./guards.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  if (req.method !== "POST") return errorResponse("Metodo non consentito",405,corsH);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { odv_id } = await req.json();

    if (typeof odv_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(odv_id)) return errorResponse("odv_id non valido",400,corsH);

    // Carica OdV
    const { data: odv, error: odvErr } = await supabaseAdmin
      .from("ordini_variazione")
      .select("*, order:orders(id, company_id, customer:profiles!orders_customer_id_fkey(full_name, email))")
      .eq("id", odv_id)
      .single();

    if (odvErr || !odv) return errorResponse("OdV non trovato", 404,corsH);

    await requireCompanyAccess(supabaseAdmin,userId,odv.company_id,corsH);
    const { data: allowed, error: permissionError } = await supabaseAdmin.rpc("has_permission_for_company",{
      _user_id:userId,_permission:"can_edit_orders",_company_id:odv.company_id,
    });
    if (permissionError || allowed !== true) return errorResponse("Non hai il permesso di inviare varianti",403,corsH);
    // Sending is NOT a lifecycle transition: never reopen an approved/rejected/cancelled document.
    if (!pendingVariation(odv)) return errorResponse("La variante non è in attesa di approvazione o la commessa non corrisponde",409,corsH);
    if (odv.link_revoked_at || new Date(odv.link_expires_at ?? new Date(new Date(odv.created_at).getTime()+30*86400000).toISOString()).getTime() <= Date.now()) return errorResponse("Link scaduto o revocato: prepara una nuova proposta prima dell'invio",409,corsH);

    // Recupera dati azienda
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", odv.company_id)
      .single();

    const customerEmail = (odv.order as any)?.customer?.email;
    const customerName = (odv.order as any)?.customer?.full_name || "Cliente";

    if (!customerEmail) {
      return errorResponse("Il cliente non ha un indirizzo email configurato",400,corsH);
    }

    // Genera o riusa firma_token
    let firmaToken = odv.firma_token;
    if (!firmaToken) {
      firmaToken = crypto.randomUUID();
      const {data: updated,error: tokenError} = await supabaseAdmin
        .from("ordini_variazione")
        .update({ firma_token: firmaToken })
        .eq("id", odv_id).eq("company_id",odv.company_id).eq("status","in_attesa").is("firma_token",null)
        .select("id,firma_token").maybeSingle();
      if (tokenError || updated?.firma_token !== firmaToken) return errorResponse("Variante modificata nel frattempo: aggiorna e riprova",409,corsH);
    }

    // Branding dinamico
    const branding = await getBrandingForCompany(supabaseAdmin, odv.company_id);
    const domain = branding.siteUrl;
    const firmaUrl = `${domain}/firma-odv/${firmaToken}`;
    const aziendaNome = company?.name || branding.platformName;
    const safeCompany = escapeVariationHtml(aziendaNome), safeCustomer = escapeVariationHtml(customerName);
    const safeTitle = escapeVariationHtml(odv.titolo), safeDescription = escapeVariationHtml(odv.descrizione).replace(/\n/g,"<br>");
    const safeUrl = escapeVariationHtml(firmaUrl), safeAmount = escapeVariationHtml(variationEmailAmount(odv.impatto_economico));

    const htmlBody = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1E3A5F; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">${safeCompany}</h1>
  </div>
  <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e0e0e0;">
    <p>Gentile ${safeCustomer},</p>
    <p>Le inviamo in approvazione l'<strong>Ordine di Variazione #${odv.numero_odv}</strong>:</p>
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 8px 0; color: #1E3A5F;">${safeTitle}</h3>
      <p style="margin: 0; color: #666; font-size: 14px;">${safeDescription}</p>
      <p style="margin: 12px 0 0 0; font-size: 18px; font-weight: bold; color: #E87722;">Variazione del prezzo, IVA esclusa: ${safeAmount}</p>
    </div>
    <p>Per approvare o rifiutare questa variazione, clicchi sul pulsante qui sotto:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${safeUrl}" style="background: #E87722; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        Visualizza e Firma OdV
      </a>
    </div>
    <p style="font-size: 12px; color: #888;">
      Se il pulsante non funziona, copi questo link nel browser:<br>
      <a href="${safeUrl}" style="color: #1E3A5F;">${safeUrl}</a>
    </p>
  </div>
  <div style="background: #f0f0f0; padding: 12px; border-radius: 0 0 8px 8px; text-align: center; font-size: 11px; color: #888;">
    ${safeCompany}${!branding.hidePoweredBy ? ` &bull; ${escapeVariationHtml(branding.poweredByText)}` : ""}
  </div>
</body>
</html>`;

    const delivery = await sendEmailUnified({
      companyId:    odv.company_id,
      stream:       "transactional",
      to:           [customerEmail],
      subject:      `Approvazione richiesta: OdV #${odv.numero_odv} — ${odv.titolo} | ${aziendaNome}`,
      html:         htmlBody,
      templateName: "odv_send",
      skipCredits:  false,
      adminClient:  supabaseAdmin,
      metadata:     { odv_id: odv.id, numero_odv: odv.numero_odv },
    });

    if (!delivery.ok) return errorResponse("Email non inviata: verifica il servizio email e riprova",502,corsH);
    return jsonResponse({ success: true, token: firmaToken, email_inviata_a: customerEmail },200,corsH);
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("[invia-odv]", err);
    return errorResponse(err.message || "Errore interno", 500,corsH);
  }
});
