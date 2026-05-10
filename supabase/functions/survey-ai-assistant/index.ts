/**
 * survey-ai-assistant — AI per sopralluoghi
 *
 * Body:
 *   { action: 'summary',     survey_id }      → riassunto strutturato + insight
 *   { action: 'quote_lines', survey_id }      → genera righe preventivo da elementi
 *
 * Usa Claude Haiku 4.5 via OpenRouter (veloce + economico).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const MODEL_ID = "anthropic/claude-haiku-4.5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callClaude(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://edilizia-in-cloud",
      "X-Title": "Survey AI Assistant",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2500,
      temperature: 0.3,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`openrouter_${res.status}: ${err.slice(0, 300)}`);
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

function formatSurveyForAI(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey: any, template: any, areas: any[], elements: any[],
): string {
  const lines: string[] = [];
  lines.push(`SOPRALLUOGO ${survey.code}`);
  lines.push(`Template: ${template.name} (categoria: ${template.category})`);
  lines.push(`Indirizzo: ${[survey.address, survey.city].filter(Boolean).join(", ") || "—"}`);
  lines.push(`Status: ${survey.status}`);
  lines.push("");

  if (survey.header_data && Object.keys(survey.header_data).length > 0) {
    lines.push("DATI GENERALI:");
    for (const [k, v] of Object.entries(survey.header_data)) {
      lines.push(`- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    lines.push("");
  }

  for (const area of areas) {
    const areaElements = elements.filter((e) => e.area_id === area.id);
    lines.push(`AREA: ${area.name} (${areaElements.length} elementi)`);
    if (area.area_data && Object.keys(area.area_data).length > 0) {
      for (const [k, v] of Object.entries(area.area_data)) {
        lines.push(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
      }
    }
    for (const el of areaElements) {
      const elType = template.schema?.element_types?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.key === el.element_type,
      );
      lines.push(`  • ${elType?.label ?? el.element_type} #${el.position + 1} (qty=${el.quantity})`);
      const vals = el.values ?? {};
      for (const [k, v] of Object.entries(vals)) {
        if (v == null || v === "") continue;
        const vs = typeof v === "object" ? JSON.stringify(v) : String(v);
        lines.push(`    - ${k}: ${vs.slice(0, 100)}`);
      }
    }
    lines.push("");
  }

  if (survey.notes) {
    lines.push(`NOTE: ${survey.notes}`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userRes } = await supabase.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) return jsonRes({ ok: false, error: "Unauthorized" }, 401);

  let body: { action?: string; survey_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.survey_id) return jsonRes({ ok: false, error: "survey_id required" }, 400);
  if (body.action !== "summary" && body.action !== "quote_lines") {
    return jsonRes({ ok: false, error: "action must be 'summary' or 'quote_lines'" }, 400);
  }

  // Carica dati
  const [{ data: survey }, { data: areas }, { data: elements }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("surveys").select("*").eq("id", body.survey_id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("survey_areas").select("*").eq("survey_id", body.survey_id).order("position"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("survey_elements").select("*").eq("survey_id", body.survey_id).order("position"),
  ]);

  if (!survey) return jsonRes({ ok: false, error: "Survey not found" }, 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: template } = await (supabase as any)
    .from("survey_templates").select("*").eq("id", survey.template_id).maybeSingle();
  if (!template) return jsonRes({ ok: false, error: "Template not found" }, 404);

  const surveyText = formatSurveyForAI(survey, template, areas ?? [], elements ?? []);

  try {
    if (body.action === "summary") {
      const sys = `Sei un AI specializzato in edilizia italiana. Ricevi i dati di un sopralluogo
tecnico e devi produrre un riassunto STRUTTURATO per il preventivista che dovrà
fare l'offerta al cliente. Sii preciso, asciutto, focalizzato.

Output JSON OBBLIGATORIO:
{
  "summary": "2-3 frasi che riassumono cosa è stato rilevato",
  "key_dimensions": [{"label": "...", "value": "..."}, ...],   // misure principali
  "complications": ["...", "..."],                              // criticità rilevate
  "estimated_complexity": "bassa|media|alta",
  "recommended_actions": ["...", "..."]                         // suggerimenti concreti
}

Lingua: italiano. Sii conciso.`;
      const raw = await callClaude(sys, `Sopralluogo da analizzare:\n\n${surveyText}`);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = { summary: raw }; }
      return jsonRes({ ok: true, ...parsed });
    }

    // quote_lines
    const sys = `Sei un AI specializzato in preventivi edilizia. Ricevi i dati di un sopralluogo
e devi generare le RIGHE DEL PREVENTIVO pronte per essere inserite nel modulo
preventivi (descrizione + qty + unità di misura). Considera il template per
mappare correttamente gli elementi.

Output JSON OBBLIGATORIO:
{
  "lines": [
    {
      "description": "Descrizione tecnica completa della voce",
      "quantity": 1,
      "unit": "pz|mq|ml|kg|kw|h",
      "category": "fornitura|posa|smaltimento|altro",
      "notes": "note opzionali"
    }
  ],
  "subtotal_estimate_eur": 0,
  "warnings": ["..."]
}

Lingua: italiano. Sii preciso nei codici tecnici.`;
    const raw = await callClaude(sys, `Sopralluogo da convertire in righe preventivo:\n\n${surveyText}`);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { lines: [], warnings: ["Parse JSON fallito"] }; }
    return jsonRes({ ok: true, ...parsed });
  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
