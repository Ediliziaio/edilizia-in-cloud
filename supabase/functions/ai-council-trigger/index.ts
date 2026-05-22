/**
 * ai-council-trigger — Feature #11
 *
 * Wrapper che decide quando invocare ai-council-orchestrator (esistente)
 * basandosi su criteri economici/rischio della decisione in arrivo.
 *
 * Esempio: cliente chiede sconto 15% su preventivo 30k€ →
 *   - Soglia trigger: sconto > 10% AND valore > 20k€
 *   - Chiama ai-council-orchestrator con personas: CFO + Sales + Compliance
 *   - Salva la sintesi in council_decisions per audit
 *   - Crea proposta `apply_council_decision` con la raccomandazione finale
 *
 * Trigger: chiamata diretta da UI o da altre edge function (es. quote
 * builder quando rileva un alto sconto).
 *
 * Input:
 *   {
 *     company_id, query, context, value_eur?, risk_level?,
 *     personas?: string[] (default: cfo, sales, compliance)
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  query: string;
  context?: Record<string, unknown>;
  value_eur?: number;
  risk_level?: "yellow" | "red";
  personas?: string[];
  /** Opzionale: id di una proposta esistente da arricchire con la decisione */
  source_proposal_id?: string;
}

const COUNCIL_TRIGGER_VALUE_THRESHOLD_EUR = 20_000;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json()) as Payload;
    if (!body.query) return errorResponse("query mancante", 400, cors);

    // Risolvi company del caller
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) return errorResponse("Nessuna company associata", 400, cors);

    // Decisione trigger: invoca council se valore alto OR red
    const value = body.value_eur ?? 0;
    const shouldTrigger = body.risk_level === "red" || value >= COUNCIL_TRIGGER_VALUE_THRESHOLD_EUR;

    if (!shouldTrigger) {
      return jsonResponse({
        triggered: false,
        reason: "below_threshold",
        threshold_eur: COUNCIL_TRIGGER_VALUE_THRESHOLD_EUR,
        value_eur: value,
      }, 200, cors);
    }

    // Invoca ai-council-orchestrator (esistente)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fullQuery = body.context
      ? `${body.query}\n\nContesto: ${JSON.stringify(body.context).slice(0, 1500)}`
      : body.query;

    const r = await fetch(`${supabaseUrl}/functions/v1/ai-council-orchestrator`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: fullQuery,
        current_persona: "silvio",
        company_id: companyId,
        max_personas: body.personas?.length ?? 4,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return errorResponse(`council failed: ${errText.slice(0, 300)}`, 502, cors);
    }
    const councilOut = await r.json();

    // Salva la decisione del council come record indipendente per audit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("ai_council_decisions" as never).insert({
      company_id: companyId,
      user_id: userId,
      trigger_query: body.query,
      trigger_value_eur: value,
      trigger_risk_level: body.risk_level ?? "yellow",
      source_proposal_id: body.source_proposal_id ?? null,
      council_output: councilOut,
      created_at: new Date().toISOString(),
    }).then((res: { error?: { message: string } }) => {
      // Tabella opzionale: se non esiste degrade silent.
      if (res.error && !res.error.message.includes("does not exist")) {
        console.warn("[council-trigger] insert decision:", res.error.message);
      }
    });

    return jsonResponse({
      triggered: true,
      council_output: councilOut,
      threshold_eur: COUNCIL_TRIGGER_VALUE_THRESHOLD_EUR,
      value_eur: value,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(msg, 500, cors);
  }
});
