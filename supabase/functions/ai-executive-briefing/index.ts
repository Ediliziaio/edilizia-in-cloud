/**
 * ai-executive-briefing — FASE I.1
 *
 * Genera un briefing esecutivo settimanale dai KPI snapshot.
 * Output: report markdown formattato con sezioni: stato salute, vincite,
 * rischi, decisioni urgenti, raccomandazioni strategiche.
 *
 * Input:  { company_id: uuid, periodo?: 'settimana'|'mese'|'trimestre' }
 * Output: { success, briefing: { titolo, sintesi, sezioni[], decisioni_urgenti[] }, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un consulente strategico C-level per imprese edili italiane.
Genera un briefing esecutivo professionale (2 minuti di lettura) basato sui KPI snapshot.

REGOLE:
- Tono executive: chiaro, sintetico, decision-oriented
- Cita SEMPRE numeri specifici dai dati (importi, %, conteggi)
- Identifica MAX 3 priorità urgenti
- Distinguishi correlazioni da causalità
- Mai inventare dati non presenti nel JSON

OUTPUT JSON ESATTO (no markdown wrapper):
{
  "titolo": "string max 80 char (es. 'Briefing settimanale 12 Gennaio')",
  "stato_salute_generale": "ottimo" | "buono" | "attenzione" | "critico",
  "sintesi_executive": "string max 400 char — paragrafo iniziale punch",
  "kpi_principali": [
    {"label": "string", "valore": "string", "trend": "up"|"down"|"stable", "commento": "string max 80 char"}
  ],
  "vincite_settimana": ["max 3 string max 100 char"],
  "rischi_rilevati": [
    {"area": "string", "rischio": "string max 150 char", "azione_consigliata": "string max 150 char", "urgenza": "alta"|"media"|"bassa"}
  ],
  "decisioni_urgenti": ["max 3 string max 200 char — decisioni che il CEO deve prendere ORA"],
  "raccomandazioni_strategiche": ["max 3 string max 150 char"],
  "trend_narrative": "string max 300 char — racconto dell'andamento"
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
    const { company_id, periodo } = body as {
      company_id?: string;
      periodo?: "settimana" | "mese" | "trimestre";
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Fetch executive snapshot
    const { data: snapshot, error: snapErr } = await supabaseAdmin.rpc(
      "silvio_executive_report", { p_company_id: company_id },
    );
    if (snapErr) return errorResponse(`Snapshot error: ${snapErr.message}`, 500, cors);

    // Fetch top alerts open
    const { data: alerts } = await supabaseAdmin
      .from("silvio_alerts")
      .select("severity, title, message, alert_type")
      .eq("company_id", company_id)
      .eq("status", "open")
      .order("severity", { ascending: true })
      .limit(10);

    // Fetch frodi/anomalie
    const { data: frodi } = await supabaseAdmin.rpc(
      "silvio_detect_frodi_anomalie", { p_company_id: company_id },
    );

    const referenceDay = new Date().toISOString().slice(0, 10);
    const payload = {
      periodo: periodo ?? "settimana",
      data_riferimento: referenceDay,
      kpi_snapshot: snapshot,
      alerts_open: alerts ?? [],
      anomalie_rilevate: frodi ?? {},
    };
    const idempotencyKey = await buildStableAiIdempotencyKey("executive_briefing", [
      company_id,
      userId,
      payload.periodo,
      referenceDay,
      snapshot,
      alerts ?? [],
      frodi ?? {},
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "report_executive",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Genera briefing per il periodo "${periodo ?? "settimana"}":\n\n${JSON.stringify(payload, null, 2)}` },
        ],
        params: { temperature: 0.3, max_tokens: 2000 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let briefing: AnyObj = {};
    try {
      briefing = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      briefing,
      contesto: {
        snapshot,
        alerts_open_count: (alerts ?? []).length,
        anomalie_count: ((frodi as AnyObj)?.anomalie_count) ?? 0,
      },
      ai_meta: {
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
