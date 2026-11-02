/**
 * ai-allocazione-operai — FASE F.1
 *
 * Suggerisce quali operai assegnare a un nuovo ordine basandosi su:
 *   - impegni e assenze nel periodo della commessa (silvio_employees_workload)
 *   - ruolo in scheda e ore dell'ultimo mese
 * Il modello non vede i nomi: vedi _shared/allocazioneOperai.ts.
 *
 * Input: { order_id: uuid, company_id: uuid, num_richiesti?: number }
 * Output: { success, suggerimenti: [{employee_id, nome, motivazione, score}], ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { operaiDaProporre, operaiPerIlModello, periodoDaControllare, suggerimentiVerificati } from "../_shared/allocazioneOperai.ts";
import { oggiRoma } from "../_shared/condizioniData.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un capocantiere esperto. Suggerisci chi assegnare al nuovo cantiere tra le persone dell'elenco.

Di ogni persona conosci SOLO ruolo in scheda, carico e ore dell'ultimo mese. Nell'elenco ci sono solo persone libere nel periodo del cantiere.

REGOLE
1. Capocantiere: proponilo solo se ruolo_in_scheda lo indica (capocantiere, capoposa, caposquadra). Se non c'è, scrivilo in warning.
2. Bilancia il carico: prima chi ha stato_carico libero o leggero. Con stato_carico ore_mancanti il carico non è misurabile: se proponi quella persona, dillo nella motivazione.
3. Rispetta il ruolo quando il lavoro lo richiede (un posatore per la posa).
4. La motivazione cita solo ruolo, carico e ore. Non parlare di esperienza, capacità o vicinanza: non hai questi dati.

OUTPUT JSON ESATTO (no markdown):
{
  "suggerimenti": [
    {
      "employee_id": "uuid (deve essere uno degli ID forniti)",
      "ruolo_proposto": "capocantiere|operaio_principale|operaio_supporto|specialista",
      "motivazione": "string max 150 char",
      "score": 0-100
    }
  ],
  "warning": ["string — es. 'Nessun capocantiere libero'"],
  "alternative": "string opzionale — es. 'Valuta una ditta esterna'"
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
    const { order_id, company_id, num_richiesti } = body as {
      order_id?: string;
      company_id?: string;
      num_richiesti?: number;
    };

    if (!order_id || !company_id) {
      return errorResponse("order_id e company_id obbligatori", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, description, work_start_date, work_end_date, expected_date")
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();
    if (orderErr || !order) {
      return errorResponse("Ordine non trovato", 404, cors);
    }

    // Chi è libero nel periodo della commessa, non oggi in generale.
    const periodo = periodoDaControllare(order, oggiRoma());
    const { data: workload, error: workloadErr } = await supabaseAdmin.rpc("silvio_employees_workload", {
      p_company_id: company_id,
      p_dal: periodo.dal,
      p_al: periodo.al,
      p_escludi_order_id: order_id,
    });
    if (workloadErr) return errorResponse("Non riesco a leggere gli impegni delle persone: riprova tra poco.", 502, cors);

    const availabili = operaiDaProporre((workload as AnyObj[] | null) ?? []);

    if (availabili.length === 0) {
      return jsonResponse({
        success: true,
        suggerimenti: [],
        warning: ["Nessuna persona di cantiere è libera nel periodo della commessa."],
        ai_meta: { skipped: true },
      }, 200, cors);
    }

    const payload = {
      cantiere: {
        descrizione: order.description,
        data_inizio: order.work_start_date,
        data_fine_prevista: order.work_end_date ?? order.expected_date,
      },
      operai_disponibili: operaiPerIlModello(availabili),
      num_richiesti: Math.max(1, Math.min(10, Number(num_richiesti ?? 3))),
    };

    let aiResult;
    try {
      const idempotencyKey = await buildStableAiIdempotencyKey("allocazione_operai", [
        company_id,
        userId,
        order_id,
        payload,
      ]);
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "ai_allocazione_operai",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) },
        ],
        params: { temperature: 0.2, max_tokens: 600 },
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

    const { suggerimenti, avvisi } = suggerimentiVerificati((parsed.suggerimenti ?? []) as AnyObj[], availabili);

    return jsonResponse({
      success: true,
      suggerimenti,
      warning: [
        ...(Array.isArray(parsed.warning) ? parsed.warning : []),
        ...avvisi,
        ...(periodo.senzaFine ? ["La commessa non ha una data di fine: ho controllato chi è libero solo il primo giorno."] : []),
      ],
      alternative: parsed.alternative ?? null,
      ai_meta: {
        operai_disponibili_count: availabili.length,
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
