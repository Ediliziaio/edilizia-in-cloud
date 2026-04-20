-- ============================================================================
-- HOTFIX · resolve_company_feature (singular) — column ambiguity
-- ============================================================================
-- Bug: in 20260417000010 la RPC single-feature dichiara in `RETURNS TABLE`
-- i parametri OUT `is_enabled`, `limit_value`, `price_override`, `expires_at`.
-- Questi diventano variabili PL/pgSQL implicite e collidono con i nomi di
-- colonna nei SELECT ... INTO da `company_feature_overrides` /
-- `plan_feature_defaults`, producendo a runtime:
--   SQLSTATE 42702 — column reference "is_enabled" is ambiguous
--
-- Effetto: useFeatureAccess(...) falliva silenziosamente in UI → ogni feature
-- risultava bloccata per chi non era super_admin, anche se l'override era
-- presente e la risoluzione batch (resolve_company_features) era corretta.
--
-- Fix: qualificare tutte le colonne lette dentro la funzione con un alias
-- tabella (cfo., pfd., pff.). Nessuna modifica alla signature pubblica né
-- alla semantica — solo disambiguazione.
-- ============================================================================

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
  SELECT pff.default_value, pff.plans_included
    INTO v_flag
    FROM public.platform_feature_flags pff
   WHERE pff.key = p_feature_key;

  IF NOT FOUND THEN
    -- Feature sconosciuta → chiuso, fail-closed.
    RETURN QUERY SELECT false::boolean, 'default'::text, NULL::integer, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  -- Override attivo (colonne qualificate per evitare ambiguità con
  -- i parametri OUT is_enabled/limit_value/price_override/expires_at)
  SELECT cfo.is_enabled, cfo.limit_value, cfo.price_override, cfo.expires_at
    INTO v_override
    FROM public.company_feature_overrides cfo
   WHERE cfo.company_id = p_company_id
     AND cfo.feature_key = p_feature_key
     AND (cfo.expires_at IS NULL OR cfo.expires_at > NOW());

  -- Default per-piano (la riga potrebbe non esistere)
  IF v_plan_id IS NOT NULL THEN
    SELECT pfd.is_enabled, pfd.limit_value
      INTO v_plan_default
      FROM public.plan_feature_defaults pfd
     WHERE pfd.plan_id = v_plan_id
       AND pfd.feature_key = p_feature_key;
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
  'Resolver v2.1 single-feature (hotfix ambiguity): override > plan_feature_defaults > plans_included > default_value.';

GRANT EXECUTE ON FUNCTION public.resolve_company_feature(uuid, text) TO authenticated;
