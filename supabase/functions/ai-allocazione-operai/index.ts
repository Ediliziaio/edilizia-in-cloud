/**
 * ai-allocazione-operai — FASE F.1
 *
 * Suggerisce quali operai assegnare a un nuovo ordine basandosi su:
 *   - workload corrente di ogni operaio
 *   - area geografica (match con indirizzo cantiere)
 *   - role_type (capocantiere/operaio/specialista)
 *   - carico simile passato per stesso tipo lavoro
 *
 * Input: { order_id: uuid, company_id: uuid, num_richiesti?: number }
 * Output: { success, suggerimenti: [{employee_id, nome, motivazione, score}], ai_meta }
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un foreman (capocantiere) esperto in allocazione team edili italiani.
Suggerisci quali operai assegnare al nuovo cantiere.

REGOLE PRIORITARIE:
1. Capocantiere: 1 obbligatorio, scegli con role_type='capocantiere' o esperienza
2. Bilancia carico: preferisci operai con stato_carico=libero o leggero
3. Area: preferisci match geografico (operaio.area ~ cantiere.indirizzo)
4. Mai overload: NON suggerire operai con stato='overload'
5. Specializzazioni: rispetta role_type quando il tipo lavoro lo richiede

OUTPUT JSON ESATTO (no markdown):
{
  "suggerimenti": [
    {
      "employee_id": "uuid (deve essere uno degli ID forniti)",
      "nome": "string",
      "ruolo_proposto": "capocantiere|operaio_principale|operaio_supporto|specialista",
      "motivazione": "string max 150 char",
      "score": 0-100
    }
  ],
  "warning": ["string — es. 'Nessun capocantiere libero'"],
  "alternative": "string opzionale — es. 'Considera assumere temporaneo'"
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

    // Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, description, address, work_start_date, expected_date, total_amount")
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();
    if (orderErr || !order) {
      return errorResponse("Ordine non trovato", 404, cors);
    }

    // Fetch workload
    const { data: workload } = await supabaseAdmin.rpc("silvio_employees_workload", {
      p_company_id: company_id,
    });

    // Filter out overload
    const availabili = (workload as AnyObj[] ?? []).filter((e) => e.stato_carico !== "overload");

    if (availabili.length === 0) {
      return jsonResponse({
        success: true,
        suggerimenti: [],
        warning: ["Nessun operaio disponibile (tutti in overload)"],
        ai_meta: { skipped: true },
      }, 200, cors);
    }

    const payload = {
      cantiere: {
        descrizione: order.description,
        indirizzo: order.address,
        data_inizio: order.work_start_date,
        data_fine_prevista: order.expected_date,
        importo_totale_eur: order.total_amount,
      },
      operai_disponibili: availabili,
      num_richiesti: Math.max(1, Math.min(10, Number(num_richiesti ?? 3))),
    };

    let aiResult;
    try {
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

    // Validate suggestions exist in availabili
    const validIds = new Set(availabili.map((e: AnyObj) => e.employee_id));
    const validSuggerimenti = ((parsed.suggerimenti ?? []) as AnyObj[]).filter(
      (s) => validIds.has(s.employee_id),
    );

    return jsonResponse({
      success: true,
      suggerimenti: validSuggerimenti,
      warning: parsed.warning ?? [],
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
