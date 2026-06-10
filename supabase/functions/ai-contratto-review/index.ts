/**
 * ai-contratto-review — FASE E.2
 *
 * Esamina un contratto d'appalto (contratti_documents.contenuto_md) e lo confronta
 * con i dati dell'ordine + computo + capitolato, segnalando incongruenze, lacune
 * normative o clausole rischiose.
 *
 * Input:  { contratto_id: uuid, company_id: uuid }
 * Output: { success, review: {...}, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const REVIEW_PROMPT = `Sei un avvocato civilista italiano specializzato in contratti d'appalto edili.
Esamina il contratto fornito + dati dell'ordine + voci del computo metrico, e produci una REVIEW di compliance.

CHECK OBBLIGATORI (rilevali se mancanti o ambigui):
- Importo contratto coerente con totale computo (deviazione max 5%)
- Date inizio/fine coerenti tra contratto e ordine
- Sicurezza: cita D.Lgs 81/08 e POS
- Penale ritardo presente con €/giorno + cap massimo
- Garanzia min 2 anni (art. 1667 c.c.)
- Subappalto: regolato (autorizzazione scritta)
- Foro competente specificato
- Privacy GDPR menzionato
- Variazioni opere: regolate (art. 1660 c.c.)
- Risoluzione/recesso: clausole presenti
- Importi sempre con 2 decimali
- Date sempre formato esplicito (dd/mm/yyyy o nome mese)

OUTPUT JSON ESATTO (no markdown):
{
  "compliance_score": int 0-100,
  "livello_rischio": "basso"|"medio"|"alto",
  "issues_critici": [
    {"area": "string", "issue": "string max 200char", "raccomandazione": "string max 150char"}
  ],
  "issues_warning": [
    {"area": "string", "issue": "string", "raccomandazione": "string"}
  ],
  "punti_forza": ["string max 100char"],
  "incongruenze_dati": [
    {"campo": "string", "in_contratto": "string", "in_ordine_o_computo": "string", "delta": "string"}
  ],
  "valutazione_finale": "string max 300 char — sintesi consulenziale"
}`;

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
    const { contratto_id, company_id } = body as {
      contratto_id?: string;
      company_id?: string;
    };

    if (!contratto_id || !company_id) {
      return errorResponse("contratto_id e company_id obbligatori", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Fetch contratto
    const { data: contratto, error: contrErr } = await supabaseAdmin
      .from("contratti_documents")
      .select("id, order_id, numero_contratto, contenuto_md, importo_totale_eur, data_inizio_lavori, data_fine_prevista, durata_giorni, penale_ritardo_eur_giorno, garanzia_anni")
      .eq("id", contratto_id)
      .eq("company_id", company_id)
      .single();
    if (contrErr || !contratto) {
      return errorResponse("Contratto non trovato", 404, cors);
    }

    // Fetch order
    let order: AnyObj | null = null;
    let orderItems: AnyObj[] = [];
    if (contratto.order_id) {
      const { data: ord } = await supabaseAdmin
        .from("orders")
        .select("description, total_amount, work_start_date, expected_date, client_name, client_company")
        .eq("id", contratto.order_id)
        .single();
      order = ord ?? null;

      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("name, description, quantity, unit_price")
        .eq("order_id", contratto.order_id);
      orderItems = items ?? [];
    }

    // Fetch computo metrico voci se presente
    const { data: computoVoci } = await supabaseAdmin
      .from("computo_voci_estratte")
      .select("descrizione, importo_unitario, quantita, totale")
      .eq("company_id", company_id)
      .limit(50);

    const totale_voci_ordine = orderItems.reduce(
      (s, it: AnyObj) => s + Number(it.unit_price ?? 0) * Number(it.quantity ?? 1), 0,
    );
    const totale_voci_computo = (computoVoci ?? []).reduce(
      (s: number, v: AnyObj) => s + Number(v.totale ?? 0), 0,
    );

    const payload = {
      contratto: {
        numero: contratto.numero_contratto,
        importo_totale_eur: contratto.importo_totale_eur,
        data_inizio: contratto.data_inizio_lavori,
        data_fine: contratto.data_fine_prevista,
        durata_giorni: contratto.durata_giorni,
        penale_eur_giorno: contratto.penale_ritardo_eur_giorno,
        garanzia_anni: contratto.garanzia_anni,
        contenuto_md: String(contratto.contenuto_md ?? "").slice(0, 18000),  // limita per token budget
      },
      ordine: order ? {
        descrizione: order.description,
        totale_eur: order.total_amount,
        data_inizio: order.work_start_date,
        data_fine_prevista: order.expected_date,
        cliente: order.client_name ?? order.client_company,
      } : null,
      voci_ordine: orderItems.slice(0, 30).map((it: AnyObj) => ({
        nome: it.name,
        quantita: it.quantity,
        prezzo_unitario: it.unit_price,
        totale: Number(it.unit_price ?? 0) * Number(it.quantity ?? 1),
      })),
      totale_voci_ordine_eur: totale_voci_ordine,
      computo_metrico_voci_disponibili: (computoVoci ?? []).length,
      totale_voci_computo_eur: totale_voci_computo,
    };
    const idempotencyKey = await buildStableAiIdempotencyKey("contratto_review", [
      company_id,
      userId,
      contratto_id,
      contratto.numero_contratto,
      payload,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "contratto_compliance_review",
        messages: [
          { role: "system", content: REVIEW_PROMPT },
          { role: "user", content: `Esamina questo contratto d'appalto:\n\n${JSON.stringify(payload, null, 2)}` },
        ],
        params: { temperature: 0.1, max_tokens: 2000 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let parsed: AnyObj = {};
    try {
      parsed = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      review: parsed,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
      },
      contesto_review: {
        contratto_numero: contratto.numero_contratto,
        ordine_collegato: !!order,
        voci_ordine_count: orderItems.length,
        voci_computo_count: (computoVoci ?? []).length,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
