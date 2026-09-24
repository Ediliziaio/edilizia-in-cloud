/**
 * ai-genera-pos-duvri — ingresso dell'assistente per «preparami il POS».
 *
 * Fino al 24/09/2026 rispondeva a chiunque avesse la chiave pubblica dell'app:
 * con gli id di un'altra azienda creava POS nella sua cartella e poteva far
 * risultare superato quello vero, e al posto dell'AI scriveva un testo fisso.
 * Ora:
 *   - serve un utente autenticato, dell'azienda, col permesso Sicurezza Cantiere
 *     e non in sola lettura;
 *   - il POS si crea come in pagina: bozza compilata dai dati dell'app sul
 *     modello ufficiale, da completare e far approvare al datore di lavoro;
 *   - il DUVRI si prepara dalla sua pagina (genera-duvri): qui non si inventa.
 *
 * Body: { cantiere_id: uuid, company_id: uuid, document_type?: 'pos'|'duvri' }
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { colonneRiassunto, preparaPosDaApp } from "../_shared/posDatiApp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);
    const { userId, supabaseAdmin: db } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const orderId = typeof body.cantiere_id === "string" ? body.cantiere_id : "";
    if (!companyId || !orderId) return errorResponse("company_id e cantiere_id sono obbligatori", 400, cors);

    await requireCompanyAccess(db, userId, companyId, cors);
    const { data: permesso } = await db.rpc("has_permission_for_company", {
      _user_id: userId, _permission: "can_view_sicurezza_cantiere", _company_id: companyId,
    });
    if (permesso !== true) return errorResponse("Non hai il permesso Sicurezza Cantiere in questa azienda", 403, cors);
    const { data: sp } = await db.from("staff_permissions").select("sola_lettura")
      .eq("user_id", userId).eq("company_id", companyId).maybeSingle();
    if (sp?.sola_lettura === true) return errorResponse("Sei in sola lettura: non puoi creare un POS", 403, cors);

    if ((body.document_type ?? "pos") !== "pos") {
      return errorResponse("Il DUVRI si prepara dalla pagina Sicurezza cantiere", 410, cors);
    }

    // Un POS della commessa ancora in bozza si riapre, non se ne crea un altro.
    const { data: esistente } = await db.from("pos_documents").select("id, status")
      .eq("company_id", companyId).eq("order_id", orderId).eq("document_type", "pos").is("superseded_by", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (esistente && !body.force_regenerate) {
      return jsonResponse({ ok: true, already_exists: true, pos_id: esistente.id, url: `/azienda/sicurezza-cantiere/pos/${esistente.id}` }, 200, cors);
    }

    let preparato;
    try {
      preparato = await preparaPosDaApp(db, companyId, orderId);
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : "Commessa non trovata", 404, cors);
    }
    const oggi = new Date().toISOString().slice(0, 10);
    const { data: doc, error } = await db.from("pos_documents").insert({
      company_id: companyId,
      order_id: orderId,
      document_type: "pos",
      status: "bozza",
      version: 1,
      revisione: 0,
      revisioni: [{ rev: 0, data: oggi, descrizione: "Prima emissione" }],
      contenuto: preparato.contenuto,
      generated_by: "app",
      created_by: userId,
      valid_from: oggi,
      ...colonneRiassunto(preparato.contenuto),
    }).select("id").single();
    if (error) return errorResponse(`POS non salvato: ${error.message}`, 500, cors);

    return jsonResponse({
      ok: true,
      document_id: doc.id,
      document_type: "pos",
      url: `/azienda/sicurezza-cantiere/pos/${doc.id}`,
      avvisi: preparato.contesto.avvisi,
      next_step: "Apri il POS, completa le voci mancanti e fallo approvare al datore di lavoro",
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, cors);
  }
});
