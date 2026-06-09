import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * sync-reseller-branding — il PRODUTTORE applica il suo brand ATTUALE (logo +
 * colore + attivazione) a TUTTI i suoi rivenditori già creati.
 *
 * I rivenditori ereditano il brand solo alla creazione (create-reseller copia
 * company_branding); questa function ri-sincronizza i rivenditori esistenti
 * quando il produttore aggiorna il brand. Copia SOLO i campi visivi: NON tocca
 * dominio/sottodominio/verifica dei rivenditori, né eleva il loro tier.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    // 1. Azienda del chiamante = il produttore (dal profilo).
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).single();
    const produttoreId = profile?.company_id as string | undefined;
    if (!produttoreId) return errorResponse("Profilo senza azienda", 403, corsH);

    // 1b. Ruolo: produttore_admin o super_admin.
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const callerRoles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
    if (!callerRoles.has("produttore_admin") && !callerRoles.has("super_admin")) {
      return errorResponse("Non autorizzato: ruolo produttore richiesto", 403, corsH);
    }

    // 1c. Azienda abilitata come produttore (tier agency) + leggi il branding sorgente.
    const { data: prodBranding } = await supabaseAdmin
      .from("company_branding").select("*").eq("company_id", produttoreId).maybeSingle();
    if (!prodBranding || prodBranding.whitelabel_tier !== "agency") {
      return errorResponse("La tua azienda non è abilitata come produttore (serve tier 'agency')", 403, corsH);
    }

    // 2. Solo i campi VISIVI (escludi chiavi tecniche, dominio/sottodominio, tier).
    const {
      id: _bid, company_id: _bcid, created_at: _bca, updated_at: _bua,
      custom_domain: _cd, custom_domain_cname: _cdc,
      custom_domain_verified: _cdv, custom_domain_verified_at: _cdva,
      subdomain: _sub, whitelabel_tier: _tier,
      ...visual
    } = prodBranding as Record<string, unknown>;

    // 3. Rivenditori del produttore.
    const { data: resellers, error: rErr } = await supabaseAdmin
      .from("companies").select("id").eq("parent_company_id", produttoreId);
    if (rErr) return errorResponse(`Errore lettura rivenditori: ${rErr.message}`, 500, corsH);
    const ids = (resellers ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return jsonResponse({ success: true, synced: 0, total: 0 }, 200, corsH);

    // 4. Applica i campi visivi al branding di ciascun rivenditore (tier 'basic',
    //    dominio del rivenditore preservato perché non incluso in `visual`).
    let synced = 0;
    const failed: string[] = [];
    for (const id of ids) {
      const { error } = await supabaseAdmin.from("company_branding").upsert(
        { ...visual, company_id: id, whitelabel_tier: "basic" },
        { onConflict: "company_id" },
      );
      if (error) failed.push(id);
      else synced++;
    }

    return jsonResponse({ success: true, synced, total: ids.length, failed: failed.length }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("sync-reseller-branding error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
