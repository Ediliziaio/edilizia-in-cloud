/**
 * ai-complaint-analyzer — analizza testo reclamo con AI
 *
 * Input: { complaint_id, company_id }
 * Flow:
 *   1. Carica reclamo (raw_text)
 *   2. AI: sentiment + urgency + category + intent + suggested_response + actions
 *   3. Salva via RPC apply_complaint_analysis (auto-escalate se critical)
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";

const SYSTEM_PROMPT = `Sei un customer success manager esperto per un'azienda edile italiana.
Analizzi reclami e feedback negativi/positivi dei clienti per produrre una risposta empatica e professionale, e suggerire azioni operative interne.

OUTPUT: solo JSON valido. Schema:
{
  "sentiment": "positive|neutral|negative|very_negative",
  "sentiment_score": -1.0..+1.0,
  "urgency": "low|medium|high|critical",
  "category": "lavori_difettosi|ritardi|fatturazione|comunicazione|prezzo|sicurezza|professionalita|altro",
  "subcategory": "stringa breve specifica (es. 'serramento installato male')",
  "summary": "Riassunto in 1-2 frasi del problema",
  "keywords": ["lista", "parole", "chiave"],
  "emotional_tone": ["frustrato","deluso","arrabbiato","sereno",...],
  "intent": "refund_request|rework_request|apology_request|just_venting|legal_threat|churn_signal|positive_feedback",
  "suggested_response": "Bozza di risposta empatica al cliente (italiano corretto, professionale, max 200 parole). Riconoscere il problema, scusarsi se appropriato, proporre soluzione concreta, ringraziare per il feedback.",
  "suggested_actions": [
    {"action":"Chiamare il cliente entro 24h", "priority":"high", "deadline_hours":24},
    {"action":"Sopralluogo tecnico", "priority":"medium", "deadline_hours":48},
    {"action":"Inviare squadra rework", "priority":"high", "deadline_hours":72}
  ],
  "compensation_suggested": <importo € se compensazione monetaria appropriata, altrimenti 0>,
  "root_cause_hypothesis": "Ipotesi causa radice (es. 'mancato controllo qualità installazione')",
  "risk_assessment": {
    "churn_risk": "low|medium|high",
    "viral_risk": "low|medium|high",  // rischio recensione negativa social/Google
    "legal_risk": "low|medium|high",
    "reputation_risk": "low|medium|high"
  }
}

REGOLE PER URGENCY:
- "critical": minaccia legale, pericolo persone, infiltrazione acqua attiva, reclamo pubblico (recensione)
- "high": cliente molto arrabbiato, churn signal, errore grave su lavoro completato
- "medium": insoddisfazione concreta ma gestibile
- "low": commento tiepido, dubbio, info request

REGOLE PER SUGGESTED_RESPONSE:
- Italiano cortese, mai automatico
- NO promesse vaghe ("ci faremo sentire") → SI promesse concrete ("entro lunedì 14, il geom. Rossi vi richiama")
- Riconosci il problema specifico, NON generico
- Se sentiment positive → ringraziare e chiedere recensione
- Se intent legal_threat → tono fermo + accenno a vie legali sue, mai escalation aggressiva da nostra parte

NON inventare dati che non hai (es. nome operatore se non menzionato). Output SOLO JSON valido.`;

interface RequestBody {
  complaint_id: string;
  company_id: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid_json");
  }

  if (!body.complaint_id || !body.company_id) {
    return jsonErr("missing_fields");
  }

  // Carica complaint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complaint, error } = await (supabase as any)
    .from("customer_complaints")
    .select("*")
    .eq("id", body.complaint_id)
    .eq("company_id", body.company_id)
    .single();

  if (error || !complaint) {
    return jsonErr(`complaint_not_found: ${error?.message ?? ""}`, 404);
  }

  // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
  const paymentBlock = await gateAiPayment(supabase, body.company_id, { "Content-Type": "application/json" });
  if (paymentBlock) return paymentBlock;

  // Mark analyzing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("customer_complaints")
    .update({ status: "analyzing", updated_at: new Date().toISOString() })
    .eq("id", body.complaint_id);

  // Build context (include order/quote info se disponibile)
  let businessContext = "";
  if (complaint.related_order_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: order } = await (supabase as any)
      .from("orders")
      .select("description, total_amount, work_end_date, fulfillment_status")
      .eq("id", complaint.related_order_id)
      .single();
    if (order) {
      businessContext = `\n\nCONTESTO ORDINE:\n- Descrizione: ${order.description ?? "-"}\n- Importo: ${order.total_amount ?? "-"}€\n- Stato: ${order.fulfillment_status ?? "-"}\n- Fine lavori: ${order.work_end_date ?? "-"}`;
    }
  }

  const userMessage = [
    `RECLAMO RICEVUTO via ${complaint.source}:`,
    "",
    complaint.raw_text,
    "",
    complaint.customer_name ? `Cliente: ${complaint.customer_name}` : "",
    businessContext,
  ].filter(Boolean).join("\n");

  let analysis: Record<string, unknown> = {};
  try {
    const aiRes = await aiRouterComplete({
      supabase,
      taskKey: "preventivo_genera",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      params: { temperature: 0.3, max_tokens: 2000 },
      companyId: body.company_id,
      personaKey: "assistente_cliente",
      estimatedCostEur: 0.04,
    });

    let text = aiRes.content.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }
    analysis = JSON.parse(text);
    analysis.ai_cost_eur = 0.04;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("customer_complaints")
      .update({ status: "analyzed", ai_summary: `AI fallita: ${(e as Error).message}` })
      .eq("id", body.complaint_id);
    return jsonErr(`analysis_failed: ${(e as Error).message}`, 500);
  }

  // Apply analysis (auto-escalation se critical)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: applyRes } = await (supabase as any).rpc(
    "silvio_tool_apply_complaint_analysis",
    {
      p_company_id: body.company_id,
      p_complaint_id: body.complaint_id,
      p_analysis: analysis,
    },
  );

  return jsonOk({
    complaint_id: body.complaint_id,
    analysis,
    apply_result: applyRes,
  });
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, ...((body as object) ?? {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function jsonErr(error: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
