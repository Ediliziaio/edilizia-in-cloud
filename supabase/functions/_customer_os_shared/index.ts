/**
 * _customer_os_shared — utilities condivise dalle 6 edge function agenti.
 *
 * Esposto come file unico per evitare problemi di bundling Dashboard
 * (le edge function Customer OS importano relativi a questo file).
 *
 * Esportazioni:
 *   - createAdminClient()        — Supabase service_role
 *   - callLLM(prompt, opts)      — wrapper Anthropic/OpenRouter
 *   - getCustomerContext(id)     — fetch profile via RPC
 *   - completeWorkflowRun(id, …) — chiude un run con cost+output
 *   - extractStatusFromError(e)
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Supabase admin client ──────────────────────────────────────────────
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}

// ─── CORS + responses ───────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function corsResponse(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ─── LLM wrapper ─────────────────────────────────────────────────────────
export interface LLMOptions {
  model?: string;          // default: claude-sonnet
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

/**
 * Wrapper a OpenRouter (configurato come provider unico per l'AI stack).
 * Routing modello via `model` param (default claude-sonnet).
 *
 * Cost calc semplificato:
 *   - Sonnet:    $3 / 1M input, $15 / 1M output
 *   - Opus:     $15 / 1M input, $75 / 1M output
 *   - 4o-mini: $0.15 / 1M input, $0.6 / 1M output
 *   - Haiku:   $0.25 / 1M input, $1.25 / 1M output
 */
const MODEL_COSTS: Record<string, { in: number; out: number }> = {
  "anthropic/claude-sonnet-4-5": { in: 3, out: 15 },
  "anthropic/claude-3-5-sonnet": { in: 3, out: 15 },
  "anthropic/claude-opus-4": { in: 15, out: 75 },
  "anthropic/claude-3-5-haiku": { in: 0.8, out: 4 },
  "openai/gpt-4o-mini": { in: 0.15, out: 0.6 },
  "openai/gpt-4o": { in: 2.5, out: 10 },
};

export async function callLLM(opts: LLMOptions): Promise<LLMResponse> {
  // 2026-05-27 (AI cost audit): default cambiato Sonnet 4.5 → Haiku 4.5.
  // Sonnet costa $3/$15 per Mtok, Haiku $0.8/$4 → 4-15× risparmio.
  // I 6 Customer OS daily/weekly task (classification, brief, JSON,
  // riscrittura email <150 parole) sono adeguati a Haiku. Le persone che
  // davvero servono Sonnet (es. marco-sales-postdemo) lo passano esplicito.
  const model = opts.model ?? "anthropic/claude-haiku-4.5";
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  // 2026-05-27 (AI cost audit): prompt caching ephemeral su system prompt.
  // Le 6 personas chiamano N volte/giorno con system prompt identico:
  // senza cache si paga full price ogni volta. Con cache_control il
  // provider sconta ~90% sui token cachati dopo il primo uso entro 5min.
  // Vedi email-ai-assistant per il pattern di riferimento.
  const systemMessage = opts.systemPrompt && opts.systemPrompt.length > 1024
    ? {
        role: "system" as const,
        content: [
          {
            type: "text",
            text: opts.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
      }
    : { role: "system" as const, content: opts.systemPrompt };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.ediliziaincloud.com",
      "X-Title": "EiC Customer OS",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model,
      messages: [
        systemMessage,
        ...opts.messages,
      ],
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM call failed: ${response.status} ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const tokensInput = data.usage?.prompt_tokens ?? 0;
  const tokensOutput = data.usage?.completion_tokens ?? 0;

  const pricing = MODEL_COSTS[model] ?? { in: 3, out: 15 };
  const costUsd = (tokensInput * pricing.in + tokensOutput * pricing.out) / 1_000_000;

  return { content, tokensInput, tokensOutput, costUsd };
}

// ─── RPC helpers ────────────────────────────────────────────────────────
export async function getCustomerContext(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc("get_customer_context", {
    p_company_id: companyId,
  });
  if (error) {
    console.error("[customer-os] getCustomerContext failed:", error.message);
    return null;
  }
  return data as Record<string, unknown>;
}

export async function completeWorkflowRun(
  supabase: SupabaseClient,
  runId: string,
  status: "completed" | "failed" | "skipped" | "awaiting_approval",
  output: Record<string, unknown> | null,
  llmResponse: LLMResponse | null,
  errorMessage?: string,
): Promise<void> {
  await supabase.rpc("complete_workflow_run", {
    p_run_id: runId,
    p_status: status,
    p_output: output,
    p_error_message: errorMessage ?? null,
    p_tokens_input: llmResponse?.tokensInput ?? null,
    p_tokens_output: llmResponse?.tokensOutput ?? null,
    p_cost_usd: llmResponse?.costUsd ?? null,
  });
}

// ─── Auth helper ────────────────────────────────────────────────────────
export async function verifyServiceRoleOrSuperAdmin(
  supabase: SupabaseClient,
  req: Request,
): Promise<{ ok: true; userId?: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, response: errorResponse("Missing Authorization", 401) };
  }

  // Service role bypass: se il token è la service role key esatta, OK
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) return { ok: true };

  // Altrimenti verifica utente + super_admin
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user) {
    return { ok: false, response: errorResponse("Invalid token", 401) };
  }

  const { data: rolesData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const isSuper = (rolesData ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuper) {
    return { ok: false, response: errorResponse("Forbidden", 403) };
  }
  return { ok: true, userId: userData.user.id };
}
