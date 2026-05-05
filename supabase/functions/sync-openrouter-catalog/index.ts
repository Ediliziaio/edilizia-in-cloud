// MP05 — sync-openrouter-catalog (cron 24h)
// Aggiorna ai_model_catalog con modelli + prezzi da https://openrouter.ai/api/v1/models.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";

const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";

const WHITELIST = new Set([
  "anthropic/claude-sonnet-4",
  "anthropic/claude-haiku-4",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "moonshot/kimi-k2",
  "deepseek/deepseek-v3",
  "deepseek/deepseek-chat-v3.1",
  "google/gemini-flash-2.5",
  "google/gemini-pro-2.5",
  "openrouter/auto",
]);

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    instruct_type?: string;
  };
  supports_tools?: boolean;
  supported_parameters?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalSecret(req, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY_missing" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const resp = await fetch(OR_MODELS_URL, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    return new Response(
      JSON.stringify({
        error: "openrouter_fetch_failed",
        status: resp.status,
        body: (await resp.text()).substring(0, 300),
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const json = (await resp.json()) as { data?: OpenRouterModel[] };
  const models = json.data ?? [];
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let upserted = 0;
  let deprecated = 0;
  const foundIds = new Set<string>();

  for (const m of models) {
    if (!m.id) continue;
    foundIds.add(m.id);

    const provider = m.id.split("/")[0] ?? "unknown";
    const pricingIn = m.pricing?.prompt
      ? Number(m.pricing.prompt) * 1_000_000
      : null;
    const pricingOut = m.pricing?.completion
      ? Number(m.pricing.completion) * 1_000_000
      : null;

    const modalityStr = m.architecture?.modality ?? "";
    const inputModalities = m.architecture?.input_modalities ?? [];
    const supportsVision =
      /vision|multimodal/i.test(modalityStr) ||
      inputModalities.includes("image");
    const supportsTools =
      m.supports_tools === true ||
      (m.supported_parameters ?? []).includes("tools") ||
      m.architecture?.instruct_type === "tools";

    const { error } = await supabase.from("ai_model_catalog").upsert(
      {
        model_id: m.id,
        provider,
        display_name: m.name ?? m.id,
        context_length: m.context_length ?? null,
        pricing_input_usd_1m: pricingIn,
        pricing_output_usd_1m: pricingOut,
        supports_tools: supportsTools,
        supports_vision: supportsVision,
        supports_json_mode: true,
        status: "active",
        whitelisted: WHITELIST.has(m.id),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "model_id" },
    );
    if (!error) upserted++;
  }

  // Marca come unavailable i modelli whitelisted non più presenti
  for (const wlId of WHITELIST) {
    if (!foundIds.has(wlId)) {
      const { error } = await supabase
        .from("ai_model_catalog")
        .update({
          status: "unavailable",
          last_synced_at: new Date().toISOString(),
        })
        .eq("model_id", wlId);
      if (!error) deprecated++;
    }
  }

  return new Response(
    JSON.stringify({
      upserted,
      deprecated,
      total_fetched: models.length,
      whitelisted_seen: [...WHITELIST].filter((id) => foundIds.has(id)).length,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
