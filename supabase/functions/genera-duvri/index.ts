import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, corsH);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { order_id, company_id, costi_sicurezza } = await req.json().catch(() => ({}));
    if (!order_id || !company_id) {
      return errorResponse("order_id e company_id sono obbligatori", 400, corsH);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, corsH);

    // Fetch order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, description, work_start_date, expected_date")
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();

    if (orderError || !order) {
      return errorResponse("Ordine non trovato", 404, corsH);
    }

    // Fetch subappaltatori tramite purchase_orders
    const { data: purchaseOrders } = await supabaseAdmin
      .from("purchase_orders")
      .select("supplier_id, suppliers(name)")
      .eq("company_id", company_id)
      .eq("order_id", order_id);

    const subappaltatori = (purchaseOrders || [])
      .map((po: any) => ({ id: po.supplier_id, nome: po.suppliers?.name || "Sconosciuto" }))
      .filter((s: any) => s.nome !== "Sconosciuto");

    // Fetch anagrafica
    const { data: anagrafica } = await supabaseAdmin
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva")
      .eq("company_id", company_id)
      .maybeSingle();

    const cantiereData = {
      descrizione_lavori: order.description,
      committente: anagrafica?.ragione_sociale || "Non specificato",
      subappaltatori: subappaltatori.map((s: any) => s.nome),
      numero_subappaltatori: subappaltatori.length,
      costi_sicurezza_stimati: Number(costi_sicurezza) || 0,
    };
    const idempotencyKey = await buildStableAiIdempotencyKey("duvri_generate", [
      company_id,
      userId,
      order_id,
      cantiereData,
    ]);

    const aiResult = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: "duvri_generate",
      companyId: company_id,
      userId,
      personaKey: "compliance",
      idempotencyKey,
      responseFormat: { type: "json_object" },
      params: { temperature: 0.1, max_tokens: 2200 },
      messages: [
        {
          role: "system",
          content: `Sei un esperto di sicurezza sul lavoro italiano specializzato in edilizia. Genera un DUVRI (Documento Unico di Valutazione dei Rischi da Interferenza) completo conforme al D.Lgs 81/2008 art. 26.
Il DUVRI deve includere OBBLIGATORIAMENTE:
1. DATI COMMITTENTE e DATORE DI LAVORO (ragione sociale, P.IVA, rappresentante legale)
2. DESCRIZIONE ATTIVITÀ INTERFERENTI tra impresa principale e subappaltatori
3. IDENTIFICAZIONE RISCHI DA INTERFERENZA per ogni coppia di attività che si sovrappongono
4. MISURE DI PREVENZIONE E PROTEZIONE specifiche per ogni interferenza identificata
5. STIMA COSTI DELLA SICUREZZA (oneri interferenze, DPI specifici, formazione)
6. FIRME (committente, datore di lavoro appaltatore, responsabile sicurezza)

Output JSON:
{
  "committente": {string},
  "appaltatore": {string},
  "interferenze": [{lavorazione_committente, lavorazione_appaltatore, rischio, livello_rischio, misura_prevenzione, responsabile}],
  "misure_generali": {string},
  "costi_sicurezza_stimati": {number},
  "costi_dettaglio": [{voce, importo}],
  "note": {string}
}
Rispondi SOLO con JSON valido, senza markdown.`,
        },
        {
          role: "user",
          content: `Genera il DUVRI completo D.Lgs.81/08 per questo cantiere edile con ${subappaltatori.length} subappaltatori: ${JSON.stringify(cantiereData, null, 2)}`,
        },
      ],
    });

    const rawContent = aiResult.content || "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { misure_generali: rawContent };
    }

    // Save to duvri_documents
    const { data: duvriDoc, error: insertError } = await supabaseAdmin
      .from("duvri_documents")
      .insert({
        company_id,
        order_id,
        committente_nome: anagrafica?.ragione_sociale || "Non specificato",
        committente_piva: anagrafica?.partita_iva || "",
        subappaltatori: subappaltatori,
        interferenze: parsed.interferenze || [],
        misure_prevenzione: parsed.misure_generali || "",
        costi_sicurezza: Number(costi_sicurezza) || parsed.costi_sicurezza_stimati || 0,
        generated_content: rawContent,
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      return errorResponse(`Errore salvataggio: ${insertError.message}`, 500, corsH);
    }

    return jsonResponse({ success: true, document: duvriDoc }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${String(err)}`, 500, corsH);
  }
});
