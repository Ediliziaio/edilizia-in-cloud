/**
 * featureResolver — logica pura di risoluzione feature gating.
 *
 * Porting client-side della RPC Postgres `resolve_company_feature`
 * (supabase/migrations/20260922000001_fix_resolve_company_feature_ambiguous.sql).
 *
 * A COSA SERVE
 *  - Test unitari della gerarchia di priorità senza dover montare un ambiente
 *    Supabase con RLS e tabelle.
 *  - Snapshot/diagnostica client-side (es. pagina debug SuperAdmin che mostra
 *    "cosa vedrà l'azienda X se cambio piano Y" senza chiamare l'RPC N volte).
 *  - Fallback di emergenza se la RPC risulta indisponibile (retry offline).
 *
 * SORGENTE UNICA DI VERITÀ RESTA IL DB
 *  - In runtime, `useFeatureAccess` e `useFeatureFlags` devono SEMPRE passare
 *    attraverso la RPC (che applica RLS, SECURITY DEFINER, e garantisce
 *    atomicità con lo stato DB).
 *  - Questo modulo è un mirror puro: se la logica DB cambia, aggiornare QUI
 *    lo stesso giorno e mantenere allineati i test.
 *
 * ORDINE DI PRIORITÀ (dall'alto verso il basso)
 *   1. company_feature_overrides        → source: "override"
 *   2. plan_feature_defaults            → source: "plan_default"
 *   3. platform_feature_flags.plans_included (slug match) → source: "plan"
 *   4. platform_feature_flags.default_value              → source: "default"
 *
 * EDGE CASES ESPLICITI
 *  - Feature sconosciuta (non in catalogo) → fail-closed { isEnabled: false, source: "default" }
 *  - Override scaduto (expires_at <= now)  → ignorato, si cade al livello sotto
 *  - Azienda senza piano (plan_slug=null)  → salta livelli 2 e 3
 */

export interface PlatformFeatureFlag {
  key: string;
  default_value: boolean;
  /** Slug dei piani che includono la feature di base (legacy fallback). */
  plans_included: readonly string[] | null;
}

export interface PlanFeatureDefault {
  plan_id: string;
  feature_key: string;
  is_enabled: boolean;
  limit_value: number | null;
}

export interface CompanyFeatureOverride {
  company_id: string;
  feature_key: string;
  is_enabled: boolean;
  limit_value: number | null;
  price_override: number | null;
  /** ISO8601. `null` = override perpetuo. */
  expires_at: string | null;
}

export interface FeatureResolverInput {
  /** Catalogo master delle feature (platform_feature_flags). */
  featureCatalog: readonly PlatformFeatureFlag[];
  /** Default per il piano corrente dell'azienda (subset filtrato). */
  planDefaults: readonly PlanFeatureDefault[];
  /** Override attivi per l'azienda (subset filtrato). */
  overrides: readonly CompanyFeatureOverride[];
  /**
   * Slug del piano corrente (es. "starter", "professional").
   * `null` se azienda senza subscription o piano eliminato.
   */
  planSlug: string | null;
  /** Chiave della feature da risolvere. */
  featureKey: string;
  /**
   * Timestamp di riferimento per la valutazione `expires_at`.
   * Default: `new Date()`. Parametrico per test deterministici.
   */
  now?: Date;
}

export type FeatureSource = "override" | "plan_default" | "plan" | "default";

export interface ResolvedFeature {
  isEnabled: boolean;
  source: FeatureSource;
  limitValue: number | null;
  priceOverride: number | null;
  /** Se source === "override", la scadenza dell'override (può essere null). */
  expiresAt: string | null;
}

/**
 * Risolve lo stato di una singola feature per un'azienda.
 *
 * Replica esatta della PLPGSQL `resolve_company_feature`:
 *   1. Lookup feature nel catalogo master → se assente, fail-closed.
 *   2. Lookup override attivo (expires_at NULL OR > now) → se presente, vince.
 *   3. Lookup plan_default per il plan_id corrente → fallback #1.
 *   4. Lookup plans_included (slug match) → fallback #2 (legacy).
 *   5. default_value della feature → fallback finale.
 *
 * Pure function: no I/O, no side effects, deterministica rispetto a `now`.
 */
export function resolveFeatureAccess(
  input: FeatureResolverInput,
): ResolvedFeature {
  const { featureCatalog, planDefaults, overrides, planSlug, featureKey } =
    input;
  const now = input.now ?? new Date();

  // Step 1: flag catalogo. Feature sconosciuta → fail-closed.
  const flag = featureCatalog.find((f) => f.key === featureKey);
  if (!flag) {
    return {
      isEnabled: false,
      source: "default",
      limitValue: null,
      priceOverride: null,
      expiresAt: null,
    };
  }

  // Step 2: override attivo (scadenza non superata). Match su feature_key.
  // Non filtriamo per company_id qui: `overrides` DEVE già contenere solo le
  // righe dell'azienda target (responsabilità del caller, tipicamente fetch
  // con WHERE company_id=eq.<id>). Questo è lo stesso contratto delle
  // mutation frontend che filtrano via RLS.
  const override = overrides.find((o) => {
    if (o.feature_key !== featureKey) return false;
    if (o.expires_at === null) return true;
    const expiresAt = new Date(o.expires_at);
    // Coerente con SQL `expires_at > NOW()`: scadenza esatta = scaduto.
    return expiresAt.getTime() > now.getTime();
  });

  // Step 3: plan_default per il piano corrente.
  // `planDefaults` DEVE già essere filtrato per plan_id corrente (caller).
  const planDefault = planDefaults.find((d) => d.feature_key === featureKey);

  // Step 4: risoluzione gerarchica (stesso ordine della RPC).
  if (override) {
    return {
      isEnabled: override.is_enabled,
      source: "override",
      // Se l'override non specifica un limit, ereditiamo dal plan_default
      // (coerente con `COALESCE(v_override.limit_value, v_plan_default.limit_value)`).
      limitValue:
        override.limit_value !== null
          ? override.limit_value
          : (planDefault?.limit_value ?? null),
      priceOverride: override.price_override,
      expiresAt: override.expires_at,
    };
  }

  if (planDefault) {
    return {
      isEnabled: planDefault.is_enabled,
      source: "plan_default",
      limitValue: planDefault.limit_value,
      priceOverride: null,
      expiresAt: null,
    };
  }

  // Fallback legacy: plans_included contiene lo slug del piano corrente.
  if (
    planSlug &&
    flag.plans_included !== null &&
    flag.plans_included.includes(planSlug)
  ) {
    return {
      isEnabled: true,
      source: "plan",
      limitValue: null,
      priceOverride: null,
      expiresAt: null,
    };
  }

  // Fallback finale: default globale della feature.
  return {
    isEnabled: flag.default_value,
    source: "default",
    limitValue: null,
    priceOverride: null,
    expiresAt: null,
  };
}

/**
 * Versione batch — risolve N feature in una sola chiamata.
 * Utile per la sidebar che deve valutare molte feature contemporaneamente
 * senza chiamare `resolveFeatureAccess` in loop (che ri-ciclerebbe
 * `featureCatalog` / `overrides` N volte).
 *
 * Complexity: O(F + P + O + K) dove F/P/O sono le dimensioni degli array
 * e K il numero di featureKeys richieste. Lo precalcolo tramite Map.
 */
export function resolveFeatureAccessBatch(
  input: Omit<FeatureResolverInput, "featureKey"> & {
    featureKeys: readonly string[];
  },
): Record<string, ResolvedFeature> {
  const { featureKeys, ...baseInput } = input;

  // Precalcolo delle Map per O(1) lookup durante il loop.
  const catalogMap = new Map(
    baseInput.featureCatalog.map((f) => [f.key, f] as const),
  );
  const now = baseInput.now ?? new Date();
  const activeOverridesMap = new Map<string, CompanyFeatureOverride>();
  for (const o of baseInput.overrides) {
    if (o.expires_at !== null) {
      const ts = new Date(o.expires_at).getTime();
      if (ts <= now.getTime()) continue;
    }
    activeOverridesMap.set(o.feature_key, o);
  }
  const planDefaultsMap = new Map(
    baseInput.planDefaults.map((d) => [d.feature_key, d] as const),
  );

  const result: Record<string, ResolvedFeature> = {};
  for (const key of featureKeys) {
    const flag = catalogMap.get(key);
    if (!flag) {
      result[key] = {
        isEnabled: false,
        source: "default",
        limitValue: null,
        priceOverride: null,
        expiresAt: null,
      };
      continue;
    }

    const override = activeOverridesMap.get(key);
    const planDefault = planDefaultsMap.get(key);

    if (override) {
      result[key] = {
        isEnabled: override.is_enabled,
        source: "override",
        limitValue:
          override.limit_value !== null
            ? override.limit_value
            : (planDefault?.limit_value ?? null),
        priceOverride: override.price_override,
        expiresAt: override.expires_at,
      };
      continue;
    }

    if (planDefault) {
      result[key] = {
        isEnabled: planDefault.is_enabled,
        source: "plan_default",
        limitValue: planDefault.limit_value,
        priceOverride: null,
        expiresAt: null,
      };
      continue;
    }

    if (
      baseInput.planSlug &&
      flag.plans_included !== null &&
      flag.plans_included.includes(baseInput.planSlug)
    ) {
      result[key] = {
        isEnabled: true,
        source: "plan",
        limitValue: null,
        priceOverride: null,
        expiresAt: null,
      };
      continue;
    }

    result[key] = {
      isEnabled: flag.default_value,
      source: "default",
      limitValue: null,
      priceOverride: null,
      expiresAt: null,
    };
  }

  return result;
}
