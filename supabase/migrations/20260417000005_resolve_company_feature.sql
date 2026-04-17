-- ============================================================================
-- P1 · Resolver centralizzato per feature access per-azienda
-- ============================================================================
-- Rimpiazza il resolver lato-client (useFeatureFlags) con una RPC SECURITY
-- DEFINER che incorpora la logica:
--     override > plan default (platform_feature_flags.plans_included) > default_value
-- Così qualunque consumer (FE, edge fn, trigger) vede la stessa verità.
-- ============================================================================

-- Variante BATCH — tutte le feature per una company
CREATE OR REPLACE FUNCTION public.resolve_company_features(
  p_company_id uuid
)
RETURNS TABLE(
  feature_key         text,
  is_enabled          boolean,
  source              text,   -- 'override' | 'plan' | 'default'
  limit_value         integer,
  price_override      numeric,
  expires_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_slug text;
BEGIN
  -- Ricava lo slug del piano corrente dell'azienda (NULL se nessun piano)
  SELECT sp.slug
    INTO v_plan_slug
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
   WHERE c.id = p_company_id;

  RETURN QUERY
  WITH ov AS (
    SELECT o.feature_key, o.is_enabled, o.limit_value, o.price_override, o.expires_at
      FROM public.company_feature_overrides o
     WHERE o.company_id = p_company_id
       AND (o.expires_at IS NULL OR o.expires_at > NOW())
  )
  SELECT
    f.key                                          AS feature_key,
    CASE
      WHEN ov.is_enabled IS NOT NULL THEN ov.is_enabled
      WHEN v_plan_slug IS NOT NULL
           AND f.plans_included IS NOT NULL
           AND v_plan_slug = ANY(f.plans_included) THEN true
      ELSE COALESCE(f.default_value, false)
    END                                            AS is_enabled,
    CASE
      WHEN ov.feature_key IS NOT NULL AND ov.is_enabled IS NOT NULL THEN 'override'
      WHEN v_plan_slug IS NOT NULL
           AND f.plans_included IS NOT NULL
           AND v_plan_slug = ANY(f.plans_included) THEN 'plan'
      ELSE 'default'
    END                                            AS source,
    ov.limit_value                                 AS limit_value,
    ov.price_override                              AS price_override,
    ov.expires_at                                  AS expires_at
    FROM public.platform_feature_flags f
    LEFT JOIN ov ON ov.feature_key = f.key
  ORDER BY f.sort_order NULLS LAST, f.key;
END;
$$;

COMMENT ON FUNCTION public.resolve_company_features IS
  'Resolver centralizzato: ritorna tutte le feature con stato risolto (override > plan default > default_value) per una company.';

-- Variante SINGLE — una sola feature (ottimizzato per gating hot-path)
CREATE OR REPLACE FUNCTION public.resolve_company_feature(
  p_company_id  uuid,
  p_feature_key text
)
RETURNS TABLE(
  is_enabled          boolean,
  source              text,
  limit_value         integer,
  price_override      numeric,
  expires_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_slug    text;
  v_flag         RECORD;
  v_override     RECORD;
  v_enabled      boolean;
  v_source       text;
BEGIN
  -- Plan slug
  SELECT sp.slug
    INTO v_plan_slug
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
   WHERE c.id = p_company_id;

  -- Flag catalogo
  SELECT default_value, plans_included
    INTO v_flag
    FROM public.platform_feature_flags
   WHERE key = p_feature_key;

  IF NOT FOUND THEN
    -- Feature sconosciuta → chiuso. Evita fail-open su flag inesistenti.
    RETURN QUERY SELECT false::boolean, 'default'::text, NULL::integer, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  -- Override attivo
  SELECT is_enabled, limit_value, price_override, expires_at
    INTO v_override
    FROM public.company_feature_overrides
   WHERE company_id = p_company_id
     AND feature_key = p_feature_key
     AND (expires_at IS NULL OR expires_at > NOW());

  IF FOUND AND v_override.is_enabled IS NOT NULL THEN
    v_enabled := v_override.is_enabled;
    v_source  := 'override';
  ELSIF v_plan_slug IS NOT NULL
    AND v_flag.plans_included IS NOT NULL
    AND v_plan_slug = ANY(v_flag.plans_included) THEN
    v_enabled := true;
    v_source  := 'plan';
  ELSE
    v_enabled := COALESCE(v_flag.default_value, false);
    v_source  := 'default';
  END IF;

  RETURN QUERY SELECT
    v_enabled,
    v_source,
    v_override.limit_value,
    v_override.price_override,
    v_override.expires_at;
END;
$$;

COMMENT ON FUNCTION public.resolve_company_feature IS
  'Resolver single-feature: ritorna lo stato risolto di UNA feature per una company (override > plan > default).';

GRANT EXECUTE ON FUNCTION public.resolve_company_features(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_company_feature(uuid, text)    TO authenticated;
