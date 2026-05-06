/**
 * ai-visit-debrief-analyzer — analizza visita commerciale post-incontro
 *
 * Input: { debrief_id, company_id }
 * Flow:
 *   1. Carica debrief (audio_path + free_notes + image_paths)
 *   2. STT audio se presente
 *   3. AI analysis: sentiment + intent + buying signals + suggested actions
 *   4. Salva analisi via RPC apply_visit_debrief_analysis
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

const SYSTEM_PROMPT = `Sei un sales coach esperto in B2B edile italiano. Analizzi appunti/audio di visite commerciali fatte da rappresentanti.

OUTPUT: solo JSON valido. Schema:
{
  "summary": "Riassunto in 2-3 frasi della visita",
  "sentiment": "positive|neutral|negative|mixed",
  "sentiment_score": -1.0..+1.0,
  "intent": "ready_to_buy|evaluating|comparing|just_info|not_interested",
  "intent_confidence": 0..1,
  "buying_signals": ["urgency_high","budget_confirmed","decision_maker_present", ...],
  "objections": ["price_concern","timing_issue","competitor_alternative", ...],
  "competitors": ["nome competitor menzionato", ...],
  "close_probability_pct": 0..100,
  "estimated_value_eur": <importo stimato preventivo>,
  "suggested_actions": [
    {"action":"Inviare proposta dettagliata", "priority":"high", "deadline_days":3},
    {"action":"Chiamare per fissare seconda visita", "priority":"medium", "deadline_days":7}
  ],
  "next_visit_days": <giorni consigliati prima della prossima visita, 0 se non serve>
}

REGOLE:
- Sii conciso, basato sui fatti del transcript
- close_probability: 80%+ se "ready_to_buy" + budget confermato; 50-70% se evaluating con segnali positivi; <30% se objections forti
- buying_signals comuni: urgency_high, budget_confirmed, decision_maker_present, technical_specs_validated, timeline_specific, referral_intent
- objections comuni: price_concern, timing_issue, competitor_alternative, technical_doubt, decision_postponed, budget_not_ready
- Output SOLO JSON, no markdown, no testo extra`;

interface RequestBody {
  debrief_id: string;
  company_id: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonErr("unauthorized", 401);

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

  if (!body.debrief_id || !body.company_id) {
    return jsonErr("missing_fields");
  }

  // Carica debrief
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: debrief, error: dErr } = await (supabase as any)
    .from("commercial_visit_debriefs")
    .select("*")
    .eq("id", body.debrief_id)
    .eq("company_id", body.company_id)
    .single();

  if (dErr || !debrief) {
    return jsonErr(`debrief_not_found: ${dErr?.message ?? ""}`, 404);
  }

  // Mark processing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("commercial_visit_debriefs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", body.debrief_id);

  // STT se audio presente
  let transcript = debrief.audio_transcript ?? "";
  if (debrief.audio_storage_path && !transcript) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: audioBlob } = await (supabase as any).storage
        .from("documenti-smart")
        .download(debrief.audio_storage_path);

      if (audioBlob) {
        const formData = new FormData();
        formData.append("audio", audioBlob, "visit.webm");
        const transcribeRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/silvio-transcribe-audio`,
          {
            method: "POST",
            headers: { Authorization: authHeader },
            body: formData,
          },
        );
        if (transcribeRes.ok) {
          const td = await transcribeRes.json();
          transcript = td?.text ?? td?.testo ?? "";
        }
      }
    } catch (e) {
      console.error("stt_error", e);
    }
  }

  // Compose context per LLM
  const fullContext = [
    transcript ? `TRASCRIZIONE AUDIO:\n${transcript}` : "",
    debrief.free_notes ? `\nNOTE LIBERE:\n${debrief.free_notes}` : "",
    debrief.visit_location ? `\nLuogo: ${debrief.visit_location}` : "",
  ].filter(Boolean).join("\n");

  if (!fullContext.trim()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("commercial_visit_debriefs")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", body.debrief_id);
    return jsonErr("no_input_to_analyze");
  }

  // Estrai dati visita
  let analysisJson: Record<string, unknown> = {};
  try {
    const aiRes = await aiRouterComplete({
      supabase,
      taskKey: "preventivo_genera",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: fullContext },
      ],
      params: { temperature: 0.2, max_tokens: 1500 },
      companyId: body.company_id,
      personaKey: "sales",
      estimatedCostEur: 0.03,
    });

    // Strippa markdown e parse
    let text = aiRes.content.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }
    analysisJson = JSON.parse(text);
    analysisJson.transcript = transcript;
    analysisJson.ai_cost_eur = 0.03;
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("commercial_visit_debriefs")
      .update({
        status: "error",
        ai_summary: `Analisi fallita: ${(e as Error).message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.debrief_id);
    return jsonErr(`analysis_failed: ${(e as Error).message}`, 500);
  }

  // Apply analysis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: applyRes } = await (supabase as any).rpc(
    "silvio_tool_apply_visit_debrief_analysis",
    {
      p_company_id: body.company_id,
      p_debrief_id: body.debrief_id,
      p_analysis: analysisJson,
    },
  );

  return jsonOk({
    debrief_id: body.debrief_id,
    analysis: analysisJson,
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
