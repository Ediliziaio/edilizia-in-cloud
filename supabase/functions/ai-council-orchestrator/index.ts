/**
 * ai-council-orchestrator — MP-09 Cross-area orchestration
 *
 * Riceve una query potenzialmente multi-area:
 *   1. Classifica via queryClassifier (multi-area? quali personas?)
 *   2. Se single-area: ritorna early con classification (caller usa la persona corrente)
 *   3. Se multi-area: invoca ai-orchestrator IN PARALLELO per ogni persona della decomposition
 *   4. Se synthesis_required: chiama Silvio per sintetizzare le N risposte
 *   5. Logga in ai_council_usage_log per cost guard
 *
 * Input:
 *   { query, current_persona, session_id?, company_id }
 *
 * Output:
 *   { multi_area, classification, sub_outputs?, synthesis?, cost_guard }
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import {
  errorResponse,
  getCorsHeaders,
  jsonResponse,
} from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { classifyQuery } from "../_shared/queryClassifier.ts";
import {
  GENERAL_EXECUTION_PLAYBOOKS,
  TOOL_SELECTION_AND_RESULT_PLAYBOOK,
} from "../_shared/executionPlaybooks.ts";

const DEFAULT_COUNCIL_SUBCALL_CONCURRENCY = 2;
const DEFAULT_COUNCIL_SUBCALL_TIMEOUT_MS = 45_000;

interface CouncilRequest {
  query: string;
  current_persona: string;
  session_id?: string;
  company_id: string;
  /** Limit personas in decomposition (cost guard). Default 4. */
  max_personas?: number;
}

interface SubOutput {
  area: string;
  persona_key: string;
  sub_query: string;
  why: string;
  response: string | null;
  rag_sources: unknown[];
  confidence: string | null;
  error?: string;
  duration_ms?: number;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  const t0 = Date.now();

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json()) as CouncilRequest;
    const { query, current_persona, session_id: _session_id, company_id } = body;
    const maxPersonas = Math.max(1, Math.min(body.max_personas ?? 4, 6));

    if (!query || !current_persona || !company_id) {
      return errorResponse(
        "query, current_persona, company_id required",
        400,
        cors,
      );
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // 1. Classify
    const classification = await classifyQuery({
      supabase: supabaseAdmin,
      query,
      currentPersona: current_persona,
      companyId: company_id,
      userId,
    });

    // 2. Cost guard: limita decomposition
    if (classification.decomposition.length > maxPersonas) {
      classification.decomposition = classification.decomposition.slice(
        0,
        maxPersonas,
      );
    }

    // Cost guard giornaliero: alert se > 50 calls/giorno per company
    try {
      const { count } = await supabaseAdmin
        .from("ai_council_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
      if ((count ?? 0) > 50) {
        console.warn(
          `[council] cost guard: company ${company_id} ha già fatto ${count} council call in 24h`,
        );
      }
    } catch { /* non bloccante */ }

    // 3. Single-area → ritorna early
    if (
      !classification.is_multi_area || classification.decomposition.length === 0
    ) {
      try {
        await supabaseAdmin.from("ai_council_usage_log").insert({
          company_id,
          user_id: userId,
          query_preview: query.slice(0, 500),
          current_persona,
          is_multi_area: false,
          primary_area: classification.primary_area,
          involved_areas: classification.involved_areas,
          involved_personas: classification.involved_personas,
          estimated_complexity: classification.estimated_complexity,
          decomposition: classification.decomposition,
          duration_ms: Date.now() - t0,
        });
      } catch { /* non bloccante */ }

      return jsonResponse(
        {
          multi_area: false,
          classification,
          recommended_persona: current_persona,
        },
        200,
        cors,
      );
    }

    // 4. Multi-area: invoca ai-orchestrator con concorrenza limitata.
    // Prima era Promise.allSettled su tutte le persone: con 100 aziende poteva
    // moltiplicare rapidamente sub-call AI + tool. Manteniamo il Council, ma
    // lo rendiamo prevedibile sotto carico.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKeyHeader = req.headers.get("apikey") ?? "";
    const subcallConcurrency = readEnvInt(
      "COUNCIL_SUBCALL_CONCURRENCY",
      DEFAULT_COUNCIL_SUBCALL_CONCURRENCY,
      1,
      4,
    );
    const subcallTimeoutMs = readEnvInt(
      "COUNCIL_SUBCALL_TIMEOUT_MS",
      DEFAULT_COUNCIL_SUBCALL_TIMEOUT_MS,
      10_000,
      90_000,
    );

    const subResults = await runLimited(
      classification.decomposition,
      subcallConcurrency,
      async (d) => {
        const start = Date.now();
        const subRes = await fetchWithTimeout(
          `${SUPABASE_URL}/functions/v1/ai-orchestrator`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
              "apikey": apiKeyHeader,
            },
            body: JSON.stringify({
              personaKey: d.persona_key,
              message: d.sub_query,
              historyLimit: 5,
            }),
          },
          subcallTimeoutMs,
        );
        const data = await subRes.json();
        if (!subRes.ok) {
          throw new Error(
            data?.error ?? data?.message ?? `ai-orchestrator ${subRes.status}`,
          );
        }
        return {
          area: d.area,
          persona_key: d.persona_key,
          sub_query: d.sub_query,
          why: d.why,
          response: data?.response ?? null,
          rag_sources: data?.ragSources ?? data?.rag_sources ?? [],
          confidence: data?.confidence ?? null,
          duration_ms: Date.now() - start,
        } as SubOutput;
      },
    );

    const subOutputs: SubOutput[] = subResults.map((s, i) => {
      if (s.status === "fulfilled") return s.value;
      const d = classification.decomposition[i];
      return {
        area: d.area,
        persona_key: d.persona_key,
        sub_query: d.sub_query,
        why: d.why,
        response: null,
        rag_sources: [],
        confidence: null,
        error: String(s.reason),
      };
    });

    // 5. Synthesis se richiesta
    let synthesisText: string | null = null;
    let synthesisCost = 0;
    if (classification.synthesis_required) {
      try {
        const synthesisPrompt = [
          "Hai ricevuto risposte tecniche interne da più aree su una stessa domanda complessa dell'imprenditore.",
          "",
          `## Domanda originale\n${query}`,
          "",
          "## Risposte tecniche interne",
          ...subOutputs.map((s) =>
            [
              `### ${s.persona_key} (area: ${s.area})`,
              `Sub-query: ${s.sub_query}`,
              `Risposta: ${s.response ?? "(errore: " + (s.error ?? "?") + ")"}`,
              s.confidence ? `Confidenza: ${s.confidence}` : "",
              "",
            ].join("\n")
          ),
          "",
          "## Compito",
          "Componi una risposta unica come Silvio, senza mostrare la cucina interna:",
          GENERAL_EXECUTION_PLAYBOOKS,
          TOOL_SELECTION_AND_RESULT_PLAYBOOK,
          "1. Rispondi DIRETTAMENTE alla domanda originale. Non aprire con 'dipende' se hai dati numerici utili: dai il minimo certificato e separa cosa manca.",
          "2. NON nominare consulenti/personas interne (es. CFO, Cliente Tutor, Silvio come fonte, Amministrazione). Usa 'dai dati aziendali' o 'dalla situazione attuale'.",
          "3. Sintetizza i punti chiave per area senza etichette interne e senza conflitti accademici inutili.",
          "4. Se i dati sono incompleti, indica quali voci mancano e proponi comunque un range/calcolo prudente basato sui dati presenti.",
          "5. Se parli di cassa, non confondere fatturato e incasso: separa venduto/fatturato, incasso previsto e cassa libera dopo materiali, posa, subappaltatori, provvigioni e IVA.",
          "6. Per domande tipo 'quanto devo fatturare/vendere/incassare', presenta scenari operativi: recupero crediti scaduti, nuove commesse solo con acconto protetto, piano misto. Non dare un solo numero come verita assoluta.",
          "7. Se nei dati compaiono data_quality.warnings, non nasconderli: spiega quali dati mancano e abbassa la certezza della risposta.",
          "8. Se nei dati compare priorita_recupero, usa quell'ordine per le azioni.",
          "9. Ricorda sempre: fatturato/venduto NON equivale a incassato; nuova vendita aiuta la cassa solo se l'acconto entra nel periodo e copre costi variabili iniziali.",
          "10. Quando parli di quanto fatturare, considera incassi previsti, saldi clienti, costi fissi, costi variabili delle commesse, merce/manodopera, margini attesi e tempi di incasso.",
          "11. Identifica conflitti tra dati se ce ne sono, senza nominare i consulenti.",
          "12. Suggerisci 2-3 azioni concrete da fare ORA, ordinate per priorità.",
          "13. Stile imprenditore-a-imprenditore (no sociologismi, no gergo tecnico inutile).",
          "",
          "Output: prosa markdown completa e operativa. Non tagliare dati decisivi per stare breve: se la domanda e' economica o cross-area, usa numeri, ipotesi, scenari e azioni in ordine di priorita'.",
        ].join("\n");

        const synthesisRes = await aiRouterComplete({
          supabase: supabaseAdmin,
          taskKey: "council_synthesis",
          messages: [{ role: "user", content: synthesisPrompt }],
          params: { temperature: 0.45, max_tokens: 4200 },
          companyId: company_id,
          userId,
          personaKey: "silvio",
        });
        synthesisText = synthesisRes.content ?? null;
        synthesisCost = synthesisRes.costBilledEur ?? 0;
      } catch (e) {
        console.warn(
          "[council] synthesis failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // 6. Log
    try {
      await supabaseAdmin.from("ai_council_usage_log").insert({
        company_id,
        user_id: userId,
        query_preview: query.slice(0, 500),
        current_persona,
        is_multi_area: true,
        primary_area: classification.primary_area,
        involved_areas: classification.involved_areas,
        involved_personas: classification.involved_personas,
        estimated_complexity: classification.estimated_complexity,
        decomposition: classification.decomposition,
        sub_outputs: subOutputs,
        synthesis_text: synthesisText,
        synthesis_used: !!synthesisText,
        total_personas_invoked: subOutputs.length,
        total_cost_eur: synthesisCost,
        duration_ms: Date.now() - t0,
      });
    } catch { /* non bloccante */ }

    return jsonResponse(
      {
        multi_area: true,
        classification,
        sub_outputs: subOutputs,
        synthesis: synthesisText,
        total_duration_ms: Date.now() - t0,
      },
      200,
      cors,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(
      err instanceof Error ? err.message : String(err),
      500,
      getCorsHeaders(req),
    );
  }
});

async function runLimited<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await worker(items[currentIndex], currentIndex),
        };
      } catch (e) {
        results[currentIndex] = {
          status: "rejected",
          reason: e,
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runWorker(),
    ),
  );
  return results;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function readEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), min), max);
}
