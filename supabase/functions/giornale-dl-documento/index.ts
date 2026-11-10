// 10/11/2026: il giornale esce con la veste propria dell'azienda (_shared/vesteHtml.ts), senza emoji e col ruolo vero di chi firma (_shared/documentoGiornale.ts, datiDocumentoGiornale.ts).
/**
 * La pagina firmata del giornale per chi ha il link (direzione lavori): niente login,
 * il token vale 30 giorni. Restituisce HTML dentro un JSON: storage e funzioni servono
 * l'HTML come testo semplice, lo mostra la pagina pubblica /giornale-dl/:token.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { leggiAziendaDocumento } from "../_shared/aziendaDocumento.ts";
import { buildGiornaleHtml } from "../_shared/documentoGiornale.ts";
import { leggiGiornateDocumento } from "../_shared/datiDocumentoGiornale.ts";
import { improntaTokenDl, tokenDlBenFormato } from "../_shared/linkGiornaleDl.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return json({ error: "Metodo non permesso" }, 405);
    const body = await req.json().catch(() => ({}));
    if (!tokenDlBenFormato(body?.token)) return json({ error: "Link non valido" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: invio, error } = await supabase.from("giornale_invii_dl")
      .select("giornale_id, company_id, scade_il").eq("token_hash", await improntaTokenDl(body.token)).maybeSingle();
    if (error) return json({ error: "Errore nel caricamento" }, 500);
    if (!invio) return json({ error: "Link non valido" }, 404);
    if (new Date(invio.scade_il).getTime() <= Date.now()) return json({ error: "Questo link è scaduto: chiedi all'impresa di inviarlo di nuovo." }, 410);

    const giornate = await leggiGiornateDocumento(supabase, { companyId: invio.company_id, giornaleId: invio.giornale_id });
    const pagina = giornate[0];
    if (!pagina || pagina.stato !== "firmata") return json({ error: "Documento non disponibile" }, 404);

    const [{ data: commessa }, azienda, branding] = await Promise.all([
      supabase.from("orders").select("description, order_code").eq("id", pagina.order_id).maybeSingle(),
      leggiAziendaDocumento(supabase, invio.company_id),
      getBrandingForCompany(supabase, invio.company_id),
    ]);
    if (!azienda) return json({ error: "Documento non disponibile" }, 404);

    const piede = branding.hidePoweredBy ? branding.platformName : `${branding.platformName} — ${branding.siteUrl.replace("https://", "")}`;
    return json({ html: buildGiornaleHtml(giornate, commessa, azienda, piede, invio.company_id), data_lavori: pagina.data_lavori });
  } catch (e) {
    console.error("giornale-dl-documento error:", e);
    return json({ error: "Errore interno" }, 500);
  }
});
