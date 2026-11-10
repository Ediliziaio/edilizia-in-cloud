// 10/11/2026: stile unico dei documenti (_shared/stileDocumenti.ts): testata col logo a sinistra e il titolo a destra, filetto d'accento, tabelle e riquadri tenui, dati societari nel piè; accento dal colore della veste o del marchio (_shared/coloreMarchioAzienda.ts).
// 10/11/2026: il giornale esce con la veste propria dell'azienda (_shared/vesteHtml.ts), senza emoji e col ruolo vero di chi firma (_shared/documentoGiornale.ts, datiDocumentoGiornale.ts).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { leggiAziendaDocumento } from "../_shared/aziendaDocumento.ts";
import { leggiColoreMarchio } from "../_shared/coloreMarchioAzienda.ts";
import { buildGiornaleHtml } from "../_shared/documentoGiornale.ts";
import { leggiGiornateDocumento } from "../_shared/datiDocumentoGiornale.ts";

interface Order {
  description: string;
  order_code: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { company_id, order_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id obbligatorio" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify access
    try {
      await verifyCompanyAccess(supabase, userId, company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Il cliente del portale ha il company_id dell'impresa: qui vedrebbe bozze e annotazioni.
    const { data: ruoli } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const elencoRuoli = ((ruoli ?? []) as Array<{ role: string }>).map((r) => r.role);
    if (elencoRuoli.includes("customer") && elencoRuoli.every((r) => r === "customer")) {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch giornale entries
    let giornate;
    try {
      giornate = await leggiGiornateDocumento(supabase, { companyId: company_id, orderId: order_id });
    } catch {
      return new Response(JSON.stringify({ error: "Errore nel caricamento dei dati" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch order info (if order_id provided)
    let order: Order | null = null;
    if (order_id) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("description, order_code")
        .eq("id", order_id)
        .single();
      order = orderData;
    }

    // Fetch company info
    const [anagrafica, coloreMarchio] = await Promise.all([leggiAziendaDocumento(supabase, company_id), leggiColoreMarchio(supabase, company_id)]);
    const azienda = anagrafica ? { ...anagrafica, colore_marchio: coloreMarchio } : null;

    if (!azienda) {
      return new Response(JSON.stringify({ error: "Dati dell'azienda non trovati" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Branding dinamico
    const branding = await getBrandingForCompany(supabase, company_id);
    const brandFooter = branding.hidePoweredBy
      ? branding.platformName
      : `${branding.platformName} — ${branding.siteUrl.replace("https://", "")}`;

    const html = buildGiornaleHtml(giornate, order, azienda, brandFooter, company_id);

    // Build filename
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const slug = order?.order_code || "tutti-cantieri";
    const filename = `giornale-lavori-${slug}-${today}.html`;

    return new Response(JSON.stringify({ html, filename }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-giornale-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
