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
 *
 * Prima le regole, poi l'AI (14/11/2026): la commessa si riconosce da CUP, CIG o codice commessa
 * (funzione SQL commessa_da_codici) senza modello. Se le regole trovano la commessa e la fattura ha
 * già la categoria, il modello non si chiama; altrimenti si chiama col motivo, che finisce nel
 * registro dei costi AI (ai_call_ledger.metadata.motivo).
 *
 * Chi chiama lo controlla requireAuth qui sotto, non il gateway: fino al
 * 24/09/2026 era pubblicata con verify_jwt = true, e il gateway rifiuta i token
 * ES256 degli utenti prima del codice — il pulsante rispondeva 401 a tutti.
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { rimborsaAddebitoAi } from "../_shared/rimborsoAi.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { commessaFinale, decidiClassificazione, type CommessaDaRegole, type ConflittoDaRegole } from "../_shared/regolePrimaDellAi.ts";
import { catenaDellaFattura } from "../_shared/catenaFatturaServer.ts";
import { esitoDaRisultatoRouter, registraEsitoLavoroAi } from "../_shared/esitoLavoroAi.ts";

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
  // Aggiunte 2026-09-06: sulle 224 fatture fornitore di renova solution queste
  // tre voci finivano tutte in "altro" (26.804 EUR, l'11% della spesa), che nel
  // controllo di gestione e' un cassetto cieco. L'affitto e le provvigioni in
  // particolare sono costi ricorrenti che vanno letti da soli.
  "affitti",             // canoni di locazione e subaffitto di immobili
  "provvigioni",         // compensi di agenti e procacciatori sul venduto
  "servizi_generali",    // pulizie, vigilanza, smaltimento, servizi di sede
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
  /** «regole» se la commessa l'hanno data CUP/CIG/codice e il modello non è servito. */
  fonte?: "ai" | "regole";
  order_motivo?: string | null;
}

/**
 * La commessa senza AI: prima i codici (CUP, CIG, codice commessa), poi la catena dei documenti
 * (DDT → ordine → commessa, ordine, indirizzo del cantiere). Un errore qui non ferma la classificazione.
 */
async function commessaDaRegole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, fattura: AnyObj, companyId: string,
): Promise<{ regola: CommessaDaRegole | null; conflitto: ConflittoDaRegole | null }> {
  const daCodici = await commessaDaCodici(supabase, fattura, companyId);
  if (daCodici) {
    // I codici sono una proposta: la conferma nel popup porta il costo sulla commessa.
    await registraCommessa(supabase, fattura.id, daCodici, "codici_commessa", "proposta");
    return { regola: daCodici, conflitto: null };
  }
  try {
    const esito = await catenaDellaFattura(supabase, {
      id: fattura.id, company_id: companyId, fornitore_id: fattura.fornitore_id ?? null, data_fattura: fattura.data_fattura ?? null,
      xml_raw: fattura.xml_raw ?? null, indice_corpo: fattura.indice_corpo ?? 0,
    });
    if (esito.conflitto) return { regola: null, conflitto: { conflitto: esito.conflitto } };
    // La catena c'è solo se è certa: «automatico», che il database fa valere solo con l'interruttore
    // acceso e su una fattura già contabilizzata col costo libero; altrimenti diventa una proposta.
    if (esito.commessa) await registraCommessa(supabase, fattura.id, esito.commessa, "catena_documenti", "automatico");
    return { regola: esito.commessa, conflitto: null };
  } catch (e) {
    console.warn("[ai-fattura-classify] catena non disponibile:", e instanceof Error ? e.message : e);
    return { regola: null, conflitto: null };
  }
}

/**
 * La commessa trovata dalle regole entra nella traccia (`acquisti_commessa_della_fattura`, solo servizio):
 * col collegamento il costo segue la commessa. Un errore qui non ferma la classificazione.
 */
async function registraCommessa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, fatturaId: string, commessa: CommessaDaRegole, regola: string, esito: "automatico" | "proposta",
): Promise<void> {
  try {
    const { error } = await supabase.rpc("acquisti_commessa_della_fattura", {
      p_fattura: fatturaId, p_order: commessa.order_id, p_regola: regola, p_esito: esito, p_motivo: commessa.motivo,
    });
    if (error) console.warn("[ai-fattura-classify] commessa non registrata:", error.message);
  } catch (e) {
    console.warn("[ai-fattura-classify] commessa non registrata:", e instanceof Error ? e.message : e);
  }
}

async function commessaDaCodici(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, fattura: AnyObj, companyId: string,
): Promise<CommessaDaRegole | null> {
  try {
    const { data, error } = await supabase.rpc("commessa_da_codici", {
      p_company_id: companyId, p_xml: fattura.xml_raw ?? null, p_righe: fattura.righe ?? null, p_escludi: fattura.id,
    });
    if (error) { console.warn("[ai-fattura-classify] regole non disponibili:", error.message); return null; }
    const r = Array.isArray(data) ? data[0] : data;
    return r?.order_id ? { order_id: String(r.order_id), motivo: String(r.motivo ?? "codice") } : null;
  } catch (e) {
    console.warn("[ai-fattura-classify] regole non disponibili:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function classifyOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, fattura: AnyObj, openOrders: AnyObj[],
  companyId: string, userId: string,
): Promise<{ result: ClassifiedFattura; modelUsed: string; tokens: number; cost: number }> {
  const { regola, conflitto } = await commessaDaRegole(supabase, fattura, companyId);
  const decisione = decidiClassificazione(regola, fattura.categoria_ai);
  // Conflitto fra i documenti e categoria già nota: l'AI non servirebbe a niente (la sua commessa
  // verrebbe scartata). Si scrive il conflitto, senza proposta, e decide una persona.
  const conflittoSenzaAi = !!conflitto && !!String(fattura.categoria_ai ?? "").trim();
  if ((!decisione.chiamaAi && regola) || conflittoSenzaAi) {
    const finale = commessaFinale(regola, { orderId: null, confidenza: 0 }, conflitto);
    await supabase
      .from("fatture_ricevute")
      .update({ order_id_suggerito: finale.orderId, order_match_confidenza: finale.confidenza, order_suggerito_motivo: finale.motivo })
      .eq("id", fattura.id);
    await registraEsitoLavoroAi(supabase, {
      companyId, flusso: "fattura_classifica", chiave: fattura.id, esito: conflitto ? "eccezione" : "senza_ai", motivo: finale.motivo,
    });
    return {
      result: {
        fattura_id: fattura.id,
        categoria_ai: String(fattura.categoria_ai),
        sottocategoria_ai: String(fattura.sottocategoria_ai ?? ""),
        confidenza: Number(fattura.categoria_confidenza ?? 0),
        order_id_match: finale.orderId,
        order_match_confidenza: finale.confidenza,
        ai_riassunto: String(fattura.ai_riassunto ?? ""),
        fonte: "regole",
        order_motivo: finale.motivo,
      },
      modelUsed: "regole",
      tokens: 0,
      cost: 0,
    };
  }
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
    // Stessa fattura ri-classificata (retry, re-upload) → cache, niente
    // seconda chiamata a pagamento (audit AI 2026-06).
    cacheTtlDays: 90,
    motivo: decisione.motivo ?? undefined,
  });

  const esitoAi = esitoDaRisultatoRouter(aiResult);
  await registraEsitoLavoroAi(supabase, {
    companyId, flusso: "fattura_classifica", chiave: fattura.id, esito: esitoAi,
    chiamateAi: esitoAi === "con_ai" ? 1 : 0, motivo: decisione.motivo,
  });

  let parsed: AnyObj;
  try {
    parsed = JSON.parse(aiResult.content);
  } catch {
    // Errore nostro dopo che il provider ha lavorato: si rimborsa (16/11/2026).
    await rimborsaAddebitoAi(supabase, { ledgerId: aiResult.ledgerId, motivo: "risposta JSON non leggibile" });
    throw new Error("AI returned invalid JSON");
  }

  // Validate categoria
  let cat = String(parsed.categoria_ai ?? "altro").toLowerCase();
  if (!CATEGORIE_VALIDE.includes(cat)) cat = "altro";

  const confClamp = Math.max(0, Math.min(1, Number(parsed.confidenza) || 0));
  const orderConf = Math.max(0, Math.min(1, Number(parsed.order_match_confidenza) || 0));
  // Validate order_id_match exists in openOrders
  let orderMatchAi: string | null = parsed.order_id_match ?? null;
  if (orderMatchAi && !openOrders.some((o) => o.id === orderMatchAi)) {
    orderMatchAi = null;
  }
  const commessa = commessaFinale(regola, { orderId: orderMatchAi, confidenza: orderConf }, conflitto);
  const orderMatch = commessa.orderId;

  // Persist. Se il salvataggio fallisce l'azienda non riceve niente: si rimborsa.
  const { error: erroreSalvataggio } = await supabase
    .from("fatture_ricevute")
    .update({
      categoria_ai: cat,
      sottocategoria_ai: String(parsed.sottocategoria_ai ?? "").slice(0, 100),
      categoria_confidenza: confClamp,
      order_id_suggerito: orderMatch,
      order_match_confidenza: commessa.confidenza,
      order_suggerito_motivo: commessa.motivo,
      ai_riassunto: String(parsed.ai_riassunto ?? "").slice(0, 500),
      ai_classificata_at: new Date().toISOString(),
      ai_classify_model: aiResult.modelUsed,
    })
    .eq("id", fattura.id);
  if (erroreSalvataggio) {
    await rimborsaAddebitoAi(supabase, { ledgerId: aiResult.ledgerId, motivo: "salvataggio fallito" });
    throw new Error(`Salvataggio della classificazione fallito: ${erroreSalvataggio.message}`);
  }

  // Il costo nasce quando si contabilizza la fattura, e in quel momento prende
  // `categoria_ai` — ma se la fattura viene classificata DOPO (com'e' normale
  // per uno storico importato in blocco) il costo resta con la categoria di
  // ripiego e il controllo di gestione non vede nulla di quanto appena capito.
  // Qui si allinea: la classificazione arriva fino al costo, non si ferma alla
  // fattura.
  if (fattura.company_cost_id) {
    await supabase
      .from("company_costs")
      .update({ category: cat, updated_at: new Date().toISOString() })
      .eq("id", fattura.company_cost_id);
  }

  return {
    result: {
      fattura_id: fattura.id,
      categoria_ai: cat,
      sottocategoria_ai: String(parsed.sottocategoria_ai ?? ""),
      confidenza: confClamp,
      order_id_match: orderMatch,
      order_match_confidenza: commessa.confidenza,
      ai_riassunto: String(parsed.ai_riassunto ?? ""),
      fonte: "ai",
      order_motivo: commessa.motivo,
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

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

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
      .select("id, cedente_ragione_sociale, cedente_piva, numero_fattura, data_fattura, imponibile_totale, totale_documento, tipo_documento, righe, note, company_cost_id, xml_raw, indice_corpo, fornitore_id, categoria_ai, sottocategoria_ai, categoria_confidenza, ai_riassunto")
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
        // Quante senza modello: commessa da CUP/CIG/codice e categoria già nota.
        fatture_da_regole: results.filter((r) => r.fonte === "regole").length,
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
