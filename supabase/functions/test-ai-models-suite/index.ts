/**
 * test-ai-models-suite — smoke test batch su tutti i modelli OpenRouter allowed.
 *
 * Uso (POST):
 *   {
 *     mode?: 'recommended' | 'top10' | 'all',  // default 'recommended'
 *     models?: string[],                        // override esplicito (vince su mode)
 *     prompt?: string,                          // default: smoke test minimo
 *     concurrency?: number,                     // default 5
 *     persist?: boolean                         // default true (salva in ai_test_runs)
 *   }
 *
 * Risposta:
 *   {
 *     tested: number,
 *     success: number,
 *     failed: number,
 *     duration_ms: number,
 *     results: Array<{
 *       model_id: string,
 *       provider: string,
 *       ok: boolean,
 *       latency_ms?: number,
 *       cost_usd?: number,
 *       tokens?: { in: number; out: number },
 *       answer_preview?: string,
 *       error?: string
 *     }>,
 *     summary_by_provider: Record<string, { ok: number; failed: number }>
 *   }
 *
 * Auth: super_admin (verifica via JWT). Usa OPENROUTER_API_KEY env.
 *
 * NB: testare 50+ modelli costa ~€0.10-0.30 totali (smoke prompt minimo).
 * I risultati popolano `ai_test_runs` quindi sono visibili anche in
 * /admin/ai-monitor → Test Lab.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const OR_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_PROMPT = "Rispondi solo con la parola 'OK'.";
const SMOKE_FEATURE = "smoke_test_models";
// Demo Azienda S.r.l. — usato come company_id per ai_test_runs (NOT NULL)
const DEMO_COMPANY_ID = "778a2c76-1253-49f2-a5e8-283363ac3e29";

interface TestRequest {
  mode?: "recommended" | "top10" | "all";
  models?: string[];
  prompt?: string;
  concurrency?: number;
  persist?: boolean;
}

interface TestResult {
  model_id: string;
  provider: string;
  ok: boolean;
  latency_ms?: number;
  cost_usd?: number;
  tokens?: { in: number; out: number };
  answer_preview?: string;
  error?: string;
}

interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string | number; completion?: string | number };
}

const ALLOWED_PROVIDERS = [
  "moonshotai", "anthropic", "openai", "google", "deepseek", "x-ai",
  "meta-llama", "mistralai", "cohere", "qwen", "perplexity", "nvidia",
  "microsoft", "amazon", "liquid", "inflection", "thudm", "z-ai",
];

const EXCLUDE_PATTERNS = [
  /:free$/i,
  /-vision$/i,
  /-instruct-v1$/i,
  /^.*\/.*-(extended|self-moderated)$/i,
  /^perplexity\/llama/i,
];

function parseProvider(modelId: string): string {
  return modelId.split("/")[0] ?? "unknown";
}

function isAllowedModel(id: string): boolean {
  if (EXCLUDE_PATTERNS.some((re) => re.test(id))) return false;
  const p = parseProvider(id);
  return ALLOWED_PROVIDERS.includes(p);
}

async function fetchAllowedModels(): Promise<OpenRouterModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`);
  const json = (await res.json()) as { data?: OpenRouterModel[] };
  return (json.data ?? []).filter((m) => isAllowedModel(m.id));
}

function pickModelsForMode(all: OpenRouterModel[], mode: TestRequest["mode"]): OpenRouterModel[] {
  if (mode === "all") return all;
  if (mode === "top10") {
    // Top 10: 1 per ognuno dei provider top + Kimi K2
    const seen = new Set<string>();
    const result: OpenRouterModel[] = [];
    const topOrder = ["moonshotai", "anthropic", "openai", "google", "deepseek", "x-ai", "meta-llama", "mistralai", "qwen", "cohere"];
    for (const p of topOrder) {
      const m = all.find((x) => parseProvider(x.id) === p && !seen.has(p));
      if (m) {
        result.push(m);
        seen.add(p);
      }
    }
    return result;
  }
  // 'recommended' = 1 modello per provider (max 20)
  const seen = new Set<string>();
  const result: OpenRouterModel[] = [];
  for (const m of all) {
    const p = parseProvider(m.id);
    if (!seen.has(p)) {
      result.push(m);
      seen.add(p);
    }
    if (result.length >= 20) break;
  }
  return result;
}

async function testOneModel(
  model: OpenRouterModel,
  apiKey: string,
  prompt: string,
): Promise<TestResult> {
  const t0 = Date.now();
  const provider = parseProvider(model.id);
  try {
    const res = await fetch(OR_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.ediliziaincloud.com",
        "X-Title": "EiC AI Models Smoke Test",
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 30,
        temperature: 0,
      }),
    });
    const latency = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text();
      return {
        model_id: model.id,
        provider,
        ok: false,
        latency_ms: latency,
        error: `HTTP ${res.status}: ${body.substring(0, 150)}`,
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? {};
    const promptTokens = Number(usage.prompt_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? 0);
    const promptPrice = Number(model.pricing?.prompt ?? 0);
    const completionPrice = Number(model.pricing?.completion ?? 0);
    const cost = promptTokens * promptPrice + completionTokens * completionPrice;
    return {
      model_id: model.id,
      provider,
      ok: !!content && content.length > 0,
      latency_ms: latency,
      cost_usd: cost,
      tokens: { in: promptTokens, out: completionTokens },
      answer_preview: String(content).substring(0, 100).trim(),
      error: !content || content.length === 0 ? "empty_content" : undefined,
    };
  } catch (e) {
    return {
      model_id: model.id,
      provider,
      ok: false,
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: super_admin only
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userData?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "auth_required" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "super_admin_required" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as TestRequest;
  const mode = body.mode ?? "recommended";
  const concurrency = Math.min(Math.max(body.concurrency ?? 5, 1), 10);
  const prompt = body.prompt ?? DEFAULT_PROMPT;
  const persist = body.persist !== false;

  const allModels = await fetchAllowedModels();
  let toTest: OpenRouterModel[];
  if (body.models && body.models.length > 0) {
    toTest = allModels.filter((m) => body.models!.includes(m.id));
  } else {
    toTest = pickModelsForMode(allModels, mode);
  }

  const t0 = Date.now();
  const results = await runWithConcurrency(toTest, (m) => testOneModel(m, apiKey, prompt), concurrency);
  const duration = Date.now() - t0;

  // Persist in ai_test_runs (uno per modello). Best-effort, non blocca response.
  if (persist) {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const rows = results.map((r) => ({
      company_id: DEMO_COMPANY_ID, // schema NOT NULL → usiamo demo company come bucket smoke test
      model_id: r.model_id,
      provider: r.provider,
      feature: SMOKE_FEATURE,
      task_key: "smoke_test",
      user_id: user.id,
      cost_usd: r.cost_usd ?? 0,
      latency_ms: r.latency_ms ?? 0,
      input_tokens: r.tokens?.in ?? 0,
      output_tokens: r.tokens?.out ?? 0,
      forced_by_user: true,
      error: r.error ?? null,
      response_excerpt: r.answer_preview ?? null,
      prompt_excerpt: prompt.substring(0, 300),
      created_at: new Date().toISOString(),
    }));
    const { error: insErr } = await adminClient.from("ai_test_runs").insert(rows);
    if (insErr) console.warn("[test-ai-models-suite] persist failed:", insErr.message);
  }

  // Aggregato per provider
  const byProvider: Record<string, { ok: number; failed: number }> = {};
  for (const r of results) {
    byProvider[r.provider] ??= { ok: 0, failed: 0 };
    if (r.ok) byProvider[r.provider].ok += 1;
    else byProvider[r.provider].failed += 1;
  }

  return new Response(
    JSON.stringify({
      tested: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      duration_ms: duration,
      mode,
      total_allowed_models: allModels.length,
      results,
      summary_by_provider: byProvider,
    }, null, 2),
    {
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
});
