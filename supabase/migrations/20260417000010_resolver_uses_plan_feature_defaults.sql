-- ============================================================================
-- P1 · Resolver v2: consulta plan_feature_defaults prima di plans_included[]
-- ============================================================================
-- Aggiorna `resolve_company_features` e `resolve_company_feature` perché,
-- quando esiste una riga in `plan_feature_defaults` per la coppia (plan, feature),
-- quella sia la sorgente autoritativa (anche se is_enabled=false — ora il
-- SuperAdmin può ESPLICITAMENTE disabilitare una feature su un piano).
--
-- Gerarchia finale:
--   1. override attivo       → company_feature_overrides
--   2. default per-plan      → plan_feature_defaults (is_enabled, limit_value)
--   3. plans_included[]      → platform_feature_flags.plans_included (legacy)
--   4. default_value         → platform_feature_flags.default_value
--   5. fallback false        → feature sconosciuta
--
-- Il campo `limit_value` ora ha due possibili origini:
--   - override.limit_value (priorità massima)
--   - plan_feature_defaults.limit_value (fallback)
-- ============================================================================

-- Variante BATCH — tutte le feature per una company
CREATE OR REPLACE FUNCTION public.resolve_company_features(
  p_company_id uuid
)
RETURNS TABLE(
  feature_key         text,
  is_enabled          boolean,
  source              text,   -- 'override' | 'plan_default' | 'plan' | 'default'
  limit_value         integer,
  price_override      numeric,
  expires_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id   uuid;
  v_plan_slug text;
BEGIN
  SELECT sp.id, sp.slug
    INTO v_plan_id, v_plan_slug
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
   WHERE c.id = p_company_id;

  RETURN QUERY
  WITH ov AS (
    SELECT o.feature_key, o.is_enabled, o.limit_value, o.price_override, o.expires_at
      FROM public.company_feature_overrides o
     WHERE o.company_id = p_company_id
       AND (o.expires_at IS NULL OR o.expires_at > NOW())
  ),
  pd AS (
    SELECT d.feature_key, d.is_enabled, d.limit_value
      FROM public.plan_feature_defaults d
     WHERE d.plan_id = v_plan_id
  )
  SELECT
    f.key AS feature_key,
    -- is_enabled: override > plan_default > plans_included > default
    CASE
      WHEN ov.is_enabled IS NOT NULL THEN ov.is_enabled
      WHEN pd.is_enabled IS NOT NULL THEN pd.is_enabled
      WHEN v_plan_slug IS NOT NULL
           AND f.plans_included IS NOT NULL
           AND v_plan_slug = ANY(f.plans_included) THEN true
      ELSE COALESCE(f.default_value, false)
    END AS is_enabled,
    -- source: stessa gerarchia
    CASE
      WHEN ov.feature_key IS NOT NULL AND ov.is_enabled IS NOT NULL THEN 'override'
      WHEN pd.feature_key IS NOT NULL THEN 'plan_default'
      WHEN v_plan_slug IS NOT NULL
           AND f.plans_included IS NOT NULL
           AND v_plan_slug = ANY(f.plans_included) THEN 'plan'
      ELSE 'default'
    END AS source,
    -- limit_value: override > plan_default
    COALESCE(ov.limit_value, pd.limit_value) AS limit_value,
    ov.price_override                          AS price_override,
    ov.expires_at                              AS expires_at
    FROM public.platform_feature_flags f
    LEFT JOIN ov ON ov.feature_key = f.key
    LEFT JOIN pd ON pd.feature_key = f.key
  ORDER BY f.sort_order NULLS LAST, f.key;
END;
$$;

COMMENT ON FUNCTION public.resolve_company_features IS
  'Resolver v2: override > plan_feature_defaults > plans_included[] > default_value. Ritorna tutte le feature con stato risolto per una company.';

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
  v_plan_id      uuid;
  v_plan_slug    text;
  v_flag         RECORD;
  v_override     RECORD;
  v_plan_default RECORD;
  v_enabled      boolean;
  v_source       text;
  v_limit        integer;
BEGIN
  SELECT sp.id, sp.slug
    INTO v_plan_id, v_plan_slug
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
   WHERE c.id = p_company_id;

  -- Flag catalogo
  SELECT default_value, plans_included
    INTO v_flag
    FROM public.platform_feature_flags
   WHERE key = p_feature_key;

  IF NOT FOUND THEN
    -- Feature sconosciuta → chiuso, fail-closed.
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

  -- Default per-piano (la riga potrebbe non esistere)
  IF v_plan_id IS NOT NULL THEN
    SELECT is_enabled, limit_value
      INTO v_plan_default
      FROM public.plan_feature_defaults
     WHERE plan_id = v_plan_id
       AND feature_key = p_feature_key;
  END IF;

  -- Risoluzione gerarchica
  IF v_override.is_enabled IS NOT NULL THEN
    v_enabled := v_override.is_enabled;
    v_source  := 'override';
    v_limit   := COALESCE(v_override.limit_value, v_plan_default.limit_value);
  ELSIF v_plan_default.is_enabled IS NOT NULL THEN
    v_enabled := v_plan_default.is_enabled;
    v_source  := 'plan_default';
    v_limit   := v_plan_default.limit_value;
  ELSIF v_plan_slug IS NOT NULL
    AND v_flag.plans_included IS NOT NULL
    AND v_plan_slug = ANY(v_flag.plans_included) THEN
    v_enabled := true;
    v_source  := 'plan';
    v_limit   := NULL;
  ELSE
    v_enabled := COALESCE(v_flag.default_value, false);
    v_source  := 'default';
    v_limit   := NULL;
  END IF;

  RETURN QUERY SELECT
    v_enabled,
    v_source,
    v_limit,
    v_override.price_override,
    v_override.expires_at;
END;
$$;

COMMENT ON FUNCTION public.resolve_company_feature IS
  'Resolver v2 single-feature: override > plan_feature_defaults > plans_included > default_value.';

GRANT EXECUTE ON FUNCTION public.resolve_company_features(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_company_feature(uuid, text)    TO authenticated;
