/**
 * Feature flag centralizzati per il rollout progressivo di UX sperimentali.
 *
 * Due sorgenti supportate, valutate in OR:
 *  - env var `import.meta.env.VITE_FF_<NAME>` (build-time)
 *  - valore `company.feature_flags` JSONB (runtime, se presente)
 *
 * Il secondo livello è opzionale: se il contesto non passa `flags`, si usa
 * solo l'env var. Questo permette di abilitare il flag in dev/staging via
 * env e di overridare per singola company via DB senza redeploy.
 */
export type KnownFeatureFlag =
  | "PREVENTIVATORE_UNIFIED_V1";

type Flags = Record<string, unknown> | null | undefined;

function readBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "on" || v === "yes";
  }
  return false;
}

function envFlag(name: KnownFeatureFlag): boolean {
  // Vite espone solo le VITE_* via import.meta.env. Tipizziamo come Record
  // per evitare any.
  const env = (import.meta as unknown as { env: Record<string, unknown> }).env;
  const key = `VITE_FF_${name}`;
  return readBool(env?.[key]);
}

/**
 * Verifica se una feature flag è attiva. Combina env var + (opzionale)
 * `company.feature_flags[<name>]` in OR.
 *
 * @example
 *   const on = isFeatureFlagOn("PREVENTIVATORE_UNIFIED_V1");
 *   const on = isFeatureFlagOn("PREVENTIVATORE_UNIFIED_V1", company?.feature_flags);
 */
export function isFeatureFlagOn(
  name: KnownFeatureFlag,
  flags?: Flags,
): boolean {
  if (envFlag(name)) return true;
  if (flags && typeof flags === "object" && name in flags) {
    return readBool((flags as Record<string, unknown>)[name]);
  }
  return false;
}

/**
 * Shortcut per il flag specifico dello Sprint A (Preventivatore Unificato).
 *
 * Default-on dal 2026-04-23: l'entry point unico "+ Aggiungi voce" e`
 * ora il flusso principale per tutte le aziende (non solo serramentisti).
 * Il flag resta esposto come "escape hatch" per disabilitare via
 * company.feature_flags = { PREVENTIVATORE_UNIFIED_V1: false } in caso
 * di regressioni. Env `VITE_FF_PREVENTIVATORE_UNIFIED_V1=false` forza off.
 */
export function isPreventivatoreUnifiedOn(flags?: Flags): boolean {
  const env = (import.meta as unknown as { env: Record<string, unknown> }).env;
  const envKey = "VITE_FF_PREVENTIVATORE_UNIFIED_V1";
  const envRaw = env?.[envKey];
  // Esplicito false (env o company flag) → disattivato
  if (typeof envRaw === "string" && ["false", "0", "off", "no"].includes(envRaw.trim().toLowerCase())) {
    return false;
  }
  if (flags && typeof flags === "object" && "PREVENTIVATORE_UNIFIED_V1" in flags) {
    const v = (flags as Record<string, unknown>).PREVENTIVATORE_UNIFIED_V1;
    if (typeof v === "boolean" && !v) return false;
    if (typeof v === "string" && ["false", "0", "off", "no"].includes(v.trim().toLowerCase())) return false;
  }
  // Default: ON
  return true;
}
