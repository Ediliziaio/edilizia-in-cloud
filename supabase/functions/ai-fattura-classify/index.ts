/**
 * ai-fattura-classify — FASE E.1
 *
 * Classifica una fattura passiva (fatture_ricevute) in:
 *   - categoria_ai (es. "materiali_edili", "manodopera", "trasporti", "consulenze")
 *   - sottocategoria_ai (es. "ferro", "calcestruzzo", "noleggio_mezzi")
 *   - confidenza 0-1
 *   - order_id_suggerito (best match con orders aperti)
 *   - ai_riassunto 1-2 frasi
 *
 * Input:
 *   { fattura_id: uuid, company_id: uuid }
 *   OR
 *   { fattura_ids: uuid[], company_id: uuid }   // batch fino a 30
 *   OR
 *   { company_id, classify_unclassified: true, limit: 50 }
 *
 * Output:
 *   { success, classified: [{fattura_id, categoria_ai, sottocategoria_ai, ...}], ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const CATEGORIE_VALIDE = [
  "materiali_edili",
  "manodopera",
  "subappalti",
  "trasporti_logistica",
  "noleggio_mezzi_attrezzature",
  "carburante",
  "utenze",
  "consulenze_professionali",
  "assicurazioni",
  "tasse_imposte",
  "manutenzioni",
  "ufficio_cancelleria",
  "marketing_pubblicita",
  "formazione",
  "viaggi_trasferte",
  "altro",
];

const SYSTEM_PROMPT = `Sei un commercialista italiano esperto in contabilità edile.
Classifica la fattura passiva nella categoria appropriata.

CATEGORIE AMMESSE (USA SOLO QUESTE):
${CATEGORIE_VALIDE.map((c) => `- ${c}`).join("\n")}

REGOLE:
- categoria_ai: una sola dalla lista sopra
- sottocategoria_ai: 1-3 parole italiane libere (es. "ferro tondino", "calcestruzzo", "operai esterni", "diesel")
- confidenza: 0.0-1.0 (1.0 = certezza assoluta)
- order_id_match: dall'elenco "ordini_aperti" forniti, scegli quello più probabile (o null)
- order_match_confidenza: 0.0-1.0
- ai_riassunto: 1-2 frasi che riassumono cosa fattura il fornitore (max 200 char)

OUTPUT JSON ESATTO (no markdown):
{
  "categoria_ai": "string",
  "sottocategoria_ai": "string",
  "confidenza": number,
  "order_id_match": "uuid o null",
  "order_match_confidenza": number,
  "ai_riassunto": "string"
}`;

interface ClassifiedFattura {
  fattura_id: string;
  categoria_ai: string;
  sottocategoria_ai: string;
  confidenza: number;
  order_id_match: string | null;
  order_match_confidenza: number;
  ai_riassunto: string;
  error?: string;
}

async function classifyOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, fattura: AnyObj, openOrders: AnyObj[],
  companyId: string, userId: string,
): Promise<{ result: ClassifiedFattura; modelUsed: string; tokens: number; cost: number }> {
  const payload = {
    fattura: {
      id: fattura.id,
      cedente: fattura.cedente_ragione_sociale,
      cedente_piva: fattura.cedente_piva,
      numero: fattura.numero_fattura,
      data: fattura.data_fattura,
      imponibile: fattura.imponibile_totale,
      totale: fattura.totale_documento,
      tipo_doc: fattura.tipo_documento,
      righe: Array.isArray(fattura.righe) ? fattura.righe.slice(0, 15) : null,
      note: fattura.note,
    },
    ordini_aperti: openOrders.slice(0, 20).map((o) => ({
      id: o.id,
      codice: o.order_code,
      cliente: o.client_name ?? o.client_company,
      descrizione: (o.description ?? "").slice(0, 200),
      indirizzo: o.work_address ?? o.client_address ?? null,
    })),
  };

  const idempotencyKey = await buildStableAiIdempotencyKey("fattura_classify", [
    companyId,
    userId,
    fattura.id,
    fattura.numero_fattura ?? null,
    fattura.data_fattura ?? null,
    fattura.totale_documento ?? null,
    fattura.righe ?? null,
    openOrders.map((o) => o.id),
  ]);
  const aiResult = await aiRouterComplete({
    supabase,
    taskKey: "fattura_classify",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload, null, 2) },
    ],
    params: { temperature: 0.1, max_tokens: 500 },
    responseFormat: { type: "json_object" },
    companyId,
    userId,
    idempotencyKey,
  });

  let parsed: AnyObj;
  try {
    parsed = JSON.parse(aiResult.content);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  // Validate categoria
  let cat = String(parsed.categoria_ai ?? "altro").toLowerCase();
  if (!CATEGORIE_VALIDE.includes(cat)) cat = "altro";

  const confClamp = Math.max(0, Math.min(1, Number(parsed.confidenza) || 0));
  const orderConf = Math.max(0, Math.min(1, Number(parsed.order_match_confidenza) || 0));
  // Validate order_id_match exists in openOrders
  let orderMatch: string | null = parsed.order_id_match ?? null;
  if (orderMatch && !openOrders.some((o) => o.id === orderMatch)) {
    orderMatch = null;
  }

  // Persist
  await supabase
    .from("fatture_ricevute")
    .update({
      categoria_ai: cat,
      sottocategoria_ai: String(parsed.sottocategoria_ai ?? "").slice(0, 100),
      categoria_confidenza: confClamp,
      order_id_suggerito: orderMatch,
      order_match_confidenza: orderConf,
      ai_riassunto: String(parsed.ai_riassunto ?? "").slice(0, 500),
      ai_classificata_at: new Date().toISOString(),
      ai_classify_model: aiResult.modelUsed,
    })
    .eq("id", fattura.id);

  return {
    result: {
      fattura_id: fattura.id,
      categoria_ai: cat,
      sottocategoria_ai: String(parsed.sottocategoria_ai ?? ""),
      confidenza: confClamp,
      order_id_match: orderMatch,
      order_match_confidenza: orderConf,
      ai_riassunto: String(parsed.ai_riassunto ?? ""),
    },
    modelUsed: aiResult.modelUsed,
    tokens: aiResult.totalTokens,
    cost: aiResult.costRealEur,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const {
      fattura_id, fattura_ids, company_id,
      classify_unclassified, limit,
    } = body as {
      fattura_id?: string;
      fattura_ids?: string[];
      company_id?: string;
      classify_unclassified?: boolean;
      limit?: number;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Build target list
    let ids: string[] = [];
    if (classify_unclassified) {
      const { data: unclass } = await supabaseAdmin
        .from("fatture_ricevute")
        .select("id")
        .eq("company_id", company_id)
        .is("categoria_ai", null)
        .order("data_fattura", { ascending: false })
        .limit(Math.min(50, Math.max(1, Number(limit ?? 30))));
      ids = (unclass ?? []).map((r: AnyObj) => r.id);
    } else if (fattura_ids && fattura_ids.length > 0) {
      ids = fattura_ids.slice(0, 30);
    } else if (fattura_id) {
      ids = [fattura_id];
    }

    if (ids.length === 0) {
      return jsonResponse({ success: true, classified: [], ai_meta: { contacts_processed: 0 } }, 200, cors);
    }

    // Fetch fatture
    const { data: fatture, error: fetchErr } = await supabaseAdmin
      .from("fatture_ricevute")
      .select("id, cedente_ragione_sociale, cedente_piva, numero_fattura, data_fattura, imponibile_totale, totale_documento, tipo_documento, righe, note")
      .eq("company_id", company_id)
      .in("id", ids);
    if (fetchErr) return errorResponse(`Fetch error: ${fetchErr.message}`, 500, cors);

    // Fetch open orders for matching
    const { data: openOrders } = await supabaseAdmin
      .from("orders")
      .select("id, order_code, client_name, client_company, description, work_address, client_address")
      .eq("company_id", company_id)
      .in("status", ["active", "confermato", "in_corso", "in_lavorazione", "nuovo"])
      .limit(50);

    const results: ClassifiedFattura[] = [];
    let totTokens = 0;
    let totCost = 0;
    let lastModel = "";

    for (const f of (fatture ?? []) as AnyObj[]) {
      try {
        const r = await classifyOne(supabaseAdmin, f, (openOrders ?? []) as AnyObj[], company_id, userId);
        results.push(r.result);
        totTokens += r.tokens;
        totCost += r.cost;
        lastModel = r.modelUsed;
      } catch (e) {
        results.push({
          fattura_id: f.id,
          categoria_ai: "altro",
          sottocategoria_ai: "",
          confidenza: 0,
          order_id_match: null,
          order_match_confidenza: 0,
          ai_riassunto: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResponse({
      success: true,
      classified: results,
      ai_meta: {
        fatture_processate: results.length,
        fatture_failed: results.filter((r) => r.error).length,
        model_used: lastModel,
        total_tokens: totTokens,
        total_cost_eur: totCost,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
