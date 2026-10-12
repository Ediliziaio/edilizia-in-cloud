import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { logoDiRiserva } from "../_shared/logoAzienda.ts";
// La pagina del documento (contenuto e aspetto) sta in documentoHtml.ts.
import { documentoHtml } from "./documentoHtml.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: getCorsHeaders(req) });
    }
    const userId = user.id;

    const { documento_id, upload } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id obbligatorio" }), { status: 400, headers: getCorsHeaders(req) });
    }

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from("documenti_fiscali")
      .select("*")
      .eq("id", documento_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), { status: 404, headers: getCorsHeaders(req) });
    }

    // Verify user belongs to this company
    try {
      await verifyCompanyAccess(supabase, userId, doc.company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato a questo documento" }), { status: 403, headers: getCorsHeaders(req) });
    }

    // Load azienda
    const { data: azienda } = await supabase
      .from("anagrafica_azienda")
      .select("*")
      .eq("company_id", doc.company_id)
      .single();

    if (!azienda) {
      return new Response(JSON.stringify({ error: "Anagrafica azienda non configurata" }), { status: 400, headers: getCorsHeaders(req) });
    }

    // Il logo dell'anagrafica vince; vuoto vale quello aziendale (_shared/logoAzienda.ts).
    const { data: profiloAzienda } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", doc.company_id)
      .maybeSingle();
    azienda.logo_url = logoDiRiserva(azienda.logo_url, profiloAzienda?.logo_url);

    // Branding dinamico
    const branding = await getBrandingForCompany(supabase, doc.company_id);
    const brandFooter = branding.hidePoweredBy
      ? `Documento generato da ${branding.platformName}`
      : `Documento generato da ${branding.platformName}`;

    const html = documentoHtml(doc, azienda, { brandFooter });

    // Upload if requested
    if (upload) {
      const filePath = `${doc.company_id}/${doc.id}/fattura.html`;
      const { error: uploadErr } = await supabase.storage
        .from("documenti-fiscali")
        .upload(filePath, new Blob([html], { type: "text/html" }), { upsert: true });

      if (uploadErr) {
        console.error("Upload error:", uploadErr);
      }

      // Update pdf_url
      await supabase
        .from("documenti_fiscali")
        .update({ pdf_url: filePath })
        .eq("id", doc.id);

      return new Response(JSON.stringify({ html, pdf_url: filePath }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ html }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-native-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: getCorsHeaders(req) });
  }
});
