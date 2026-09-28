// Genera il PDF "modello bagno" (verticale BAGNI) lato server, come vero PDF
// (pdf-lib) da mandare su WhatsApp. (28/09/2026)
//
// Perché esiste: il bel documento del bagno finora si disegnava SOLO nel browser
// (@react-pdf, DocumentoEdilePDF), quindi il bot non poteva mandarlo. Qui si
// costruisce un PDF vero e brandizzato dai dati del preventivo (quotes +
// quote_items) e dal template estetico dell'azienda (bgn_template_pdf).
// Il render vero sta in _shared/bagnoPdf.ts (puro e testabile); qui solo
// autenticazione, gate del modulo, lettura dati e salvataggio.
//
// Ingresso interno del bot: chiave di servizio + per_utente (come generate-quote-pdf).

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
import { renderBagnoPdf, type VoceBagno } from "../_shared/bagnoPdf.ts";
// Modello VERO (@react-pdf, DocumentoEdilePDF) bundlato per Deno. Se il render
// reale fallisce (limiti edge), si ripiega sul PDF pdf-lib qui sopra.
// @ts-ignore bundle generato, senza tipi
import { renderBagnoReale } from "./_render.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Risoluzione feature col client di servizio (bypassa la guardia auth.uid della
// RPC resolve_company_feature, che rifiuta le chiamate di servizio). Replica la
// priorità: override > default del piano > piano incluso > default del flag.
// L'appartenenza utente↔azienda è già stata verificata (requireCompanyAccess).
async function moduloAttivo(db: Any, companyId: string, featureKey: string): Promise<boolean> {
  const vero = (accessLevel: Any, isEnabled: Any) => accessLevel === "enabled" || isEnabled === true;
  const { data: ov } = await db.from("company_feature_overrides")
    .select("access_level, is_enabled, expires_at")
    .eq("company_id", companyId).eq("feature_key", featureKey).maybeSingle();
  if (ov && ov.is_enabled !== null && (ov.expires_at === null || new Date(ov.expires_at) > new Date())) {
    return vero(ov.access_level, ov.is_enabled);
  }
  const { data: comp } = await db.from("companies").select("subscription_plan_id, subscription_plans(slug)").eq("id", companyId).maybeSingle();
  const planId = comp?.subscription_plan_id ?? null;
  const planSlug = comp?.subscription_plans?.slug ?? null;
  if (planId) {
    const { data: pd } = await db.from("plan_feature_defaults").select("access_level, is_enabled").eq("plan_id", planId).eq("feature_key", featureKey).maybeSingle();
    if (pd) return vero(pd.access_level, pd.is_enabled);
  }
  const { data: flag } = await db.from("platform_feature_flags").select("default_value, plans_included").eq("key", featureKey).maybeSingle();
  if (planSlug && Array.isArray(flag?.plans_included) && flag.plans_included.includes(planSlug)) return true;
  return flag?.default_value === true;
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  try {
    const body = await req.json().catch(() => ({}));
    const interna = chiamataInternaValida(req) && typeof body?.per_utente === "string";
    const { userId, supabaseAdmin } = interna
      ? { userId: body.per_utente as string, supabaseAdmin: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) }
      : await requireAuth(req, corsH);

    const quoteId = String(body?.quote_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return errorResponse("quote_id obbligatorio", 400, corsH);

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("id, company_id, quote_number, client_name, title, subtotal, vat_amount, total, discount_amount, tipo_lavoro, validity_days, created_at, deleted_at")
      .eq("id", quoteId).maybeSingle();
    if (!quote || quote.deleted_at) return errorResponse("preventivo non trovato", 404, corsH);
    await requireCompanyAccess(supabaseAdmin, userId, quote.company_id, corsH);

    // Gate: il modulo Bagni dev'essere sbloccato per l'azienda.
    if (!(await moduloAttivo(supabaseAdmin, quote.company_id, "modulo_bagni_attivo"))) {
      return errorResponse("Il modulo Bagni non è attivo per questa azienda.", 403, corsH);
    }

    const [{ data: items }, { data: tpl }, { data: azienda }] = await Promise.all([
      supabaseAdmin.from("quote_items").select("name, description, quantity, unit_price, unit_of_measure, item_type, sort_order").eq("quote_id", quoteId).order("sort_order"),
      supabaseAdmin.from("bgn_template_pdf").select("*").eq("company_id", quote.company_id).maybeSingle(),
      supabaseAdmin.from("companies").select("name, phone, email").eq("id", quote.company_id).maybeSingle(),
    ]);

    const righe: VoceBagno[] = (items ?? []).map((r: Any) => ({
      name: String(r.name ?? ""), description: String(r.description ?? r.name ?? ""),
      quantity: Number(r.quantity) || 1, unit_price: Number(r.unit_price) || 0,
      unit_of_measure: r.unit_of_measure ?? null, item_type: r.item_type ?? null,
    }));

    // Prima il modello VERO (@react-pdf, 15+ pagine); se fallisce sui limiti
    // dell'edge, ripiego sul PDF semplice (pdf-lib) così l'utente riceve comunque.
    let bytes: Uint8Array;
    let pages = 0;
    try {
      bytes = await renderBagnoReale({ quote, items: items ?? [], template: tpl ?? {}, company: azienda ?? null });
    } catch (e) {
      console.error(JSON.stringify({ level: "warn", fn: "bgn-genera-pdf", passo: "render_reale_fallito_fallback", err: e instanceof Error ? e.message : String(e) }));
      const r = await renderBagnoPdf({ quote, righe, template: tpl ?? {}, azienda: azienda ?? null });
      bytes = r.bytes;
      pages = r.pages;
    }

    const fileName = `bagno/${quote.company_id}/${quoteId}-${Date.now()}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage.from("quote-pdfs").upload(fileName, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) { console.error(JSON.stringify({ level: "error", fn: "bgn-genera-pdf", passo: "upload", err: upErr.message })); return errorResponse("Non sono riuscito a salvare il PDF.", 500, corsH); }
    const { data: signed } = await supabaseAdmin.storage.from("quote-pdfs").createSignedUrl(fileName, 3600);

    return jsonResponse({ success: true, signed_url: signed?.signedUrl ?? null, pages_count: pages, quote_number: quote.quote_number }, 200, corsH);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", fn: "bgn-genera-pdf", err: err instanceof Error ? err.message : String(err) }));
    return errorResponse(err instanceof Error ? err.message : String(err), 500, corsH);
  }
});
