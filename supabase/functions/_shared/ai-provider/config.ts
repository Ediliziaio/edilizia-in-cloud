// MP05-FIX — resolveModelConfig: solo global SuperAdmin (rimosso lookup company).
// L'azienda non sceglie il modello (F1-F3).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { TaskKind } from "./types.ts";

export interface ResolvedModelConfig {
  primary_model: string;
  fallback_chain: string[];
  max_cost_usd_per_call: number;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
}

interface DbConfigRow {
  primary_model: string;
  fallback_chain: unknown;
  max_cost_usd_per_call: number | string | null;
  temperature: number | string | null;
  max_tokens: number | null;
  enabled: boolean | null;
}

/**
 * MP05-FIX: rimosso lookup per-company. Solo config globale SuperAdmin.
 * companyId è ricevuto solo per compatibilità firma (logging, non resolver).
 */
export async function resolveModelConfig(
  supabase: SupabaseClient,
  taskKind: TaskKind,
  _companyId?: string | null,
): Promise<ResolvedModelConfig> {
  // 1. Global task-specific (company_id IS NULL)
  const { data: globalConf } = await supabase
    .from("ai_model_config")
    .select(
      "primary_model, fallback_chain, max_cost_usd_per_call, temperature, max_tokens, enabled",
    )
    .is("company_id", null)
    .eq("task_kind", taskKind)
    .eq("enabled", true)
    .maybeSingle();
  if (globalConf) return normalize(globalConf as DbConfigRow);

  // 2. Global 'default' fallback
  const { data: defaultConf } = await supabase
    .from("ai_model_config")
    .select(
      "primary_model, fallback_chain, max_cost_usd_per_call, temperature, max_tokens, enabled",
    )
    .is("company_id", null)
    .eq("task_kind", "default")
    .eq("enabled", true)
    .maybeSingle();
  if (defaultConf) return normalize(defaultConf as DbConfigRow);

  // 3. Emergency hardcoded — usata quando la config sul DB è irraggiungibile.
  //    Audit 2026-09-03: in coda c'era `openrouter/auto`, che sceglie il modello
  //    da solo. Sembrava una rete di sicurezza, ma e' l'opposto: costo
  //    imprevedibile (qui sotto lo si prezza a occhio 1,5/6,0 $ per milione,
  //    che con un modello premium e' una sottostima secca) e in produzione ha
  //    gia' risposto 402 "crediti esauriti" proprio nel momento del ripiego.
  //    Due modelli veri, economici e con vision reggono meglio la stessa rete.
  return {
    primary_model: "openai/gpt-4o-mini",
    fallback_chain: ["anthropic/claude-haiku-4.5", "google/gemini-2.5-flash"],
    max_cost_usd_per_call: 0.2,
    temperature: 0.5,
    max_tokens: 800,
    enabled: true,
  };
}

function normalize(row: DbConfigRow): ResolvedModelConfig {
  return {
    primary_model: row.primary_model,
    fallback_chain: Array.isArray(row.fallback_chain)
      ? (row.fallback_chain as string[])
      : [],
    max_cost_usd_per_call: Number(row.max_cost_usd_per_call ?? 0.2),
    temperature: Number(row.temperature ?? 0.5),
    max_tokens: Number(row.max_tokens ?? 800),
    enabled: row.enabled !== false,
  };
}

export async function validateModel(
  supabase: SupabaseClient,
  modelId: string,
): Promise<{
  valid: boolean;
  reason?: string;
  pricing?: { input: number; output: number };
}> {
  if (modelId === "openrouter/auto") {
    return { valid: true, pricing: { input: 1.5, output: 6.0 } };
  }
  const { data } = await supabase
    .from("ai_model_catalog")
    .select("status, whitelisted, pricing_input_usd_1m, pricing_output_usd_1m")
    .eq("model_id", modelId)
    .maybeSingle();
  if (!data) return { valid: false, reason: "model_not_in_catalog" };
  if (data.status !== "active") return { valid: false, reason: `model_${data.status}` };
  if (!data.whitelisted) return { valid: false, reason: "not_whitelisted" };
  return {
    valid: true,
    pricing: {
      input: Number(data.pricing_input_usd_1m ?? 0),
      output: Number(data.pricing_output_usd_1m ?? 0),
    },
  };
}
