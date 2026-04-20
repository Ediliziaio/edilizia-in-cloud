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

/** Shortcut per il flag specifico dello Sprint A (Preventivatore Unificato). */
export function isPreventivatoreUnifiedOn(flags?: Flags): boolean {
  return isFeatureFlagOn("PREVENTIVATORE_UNIFIED_V1", flags);
}
