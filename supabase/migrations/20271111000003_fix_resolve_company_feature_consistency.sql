-- Fix gating moduli: la RPC SINGOLARE resolve_company_feature (usata da FeatureRoute,
-- il guard di rotta) divergeva dalla PLURALE resolve_company_features (usata dalla sidebar):
--  (1) BUG "FOUND": l'IF del ramo override leggeva il FOUND della SELECT successiva
--      (platform_feature_flags) invece di quella dell'override → per ogni feature con un
--      flag ma SENZA override ritornava access_level NULL ("disabled"), saltando il plan-default.
--  (2) Leggeva il piano da company_subscriptions (di fatto NON popolata: 9/10 aziende con
--      piano non hanno una riga 'active') invece che da companies.subscription_plan_id come
--      la plurale → piano non trovato → tutto "disabled".
-- Sintomo: la voce di menu si vede (plurale OK) ma la rotta dice "Funzionalità non inclusa"
-- (singolare KO). Es. Green Energy (Enterprise) → crm_modulo bloccato pur essendo nel piano.
-- Fix: riscritta la singolare per rispecchiare ESATTAMENTE la gerarchia della plurale
-- (override > plan_default > plan via slug in plans_included > default_value), con il piano
-- da companies.subscription_plan_id e FOUND catturato subito dopo ogni SELECT.
-- Verificato: 12 aziende × 53 feature = 0 discrepanze singolare↔plurale; crm_modulo Green
-- Energy ora enabled (source plan_default). Già applicata a prod via MCP.

CREATE OR REPLACE FUNCTION public.resolve_company_feature(p_company_id uuid, p_feature_key text)
 RETURNS TABLE(is_enabled boolean, access_level feature_access_level, source text, limit_value numeric, price_override numeric, expires_at timestamp with time zone, supports_preview boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan_id uuid;
  v_plan_slug text;
  v_ov RECORD;
  v_pd RECORD;
  v_flag RECORD;
  v_has_ov boolean := false;
  v_has_pd boolean := false;
  v_supports_preview boolean := true;
BEGIN
  -- Piano dell'azienda: coerente con resolve_company_features (plurale, sidebar).
  SELECT sp.id, sp.slug INTO v_plan_id, v_plan_slug
  FROM public.companies c
  LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
  WHERE c.id = p_company_id;

  SELECT pff.default_value, pff.plans_included, pff.supports_preview INTO v_flag
  FROM public.platform_feature_flags pff WHERE pff.key = p_feature_key;
  v_supports_preview := COALESCE(v_flag.supports_preview, true);

  -- 1. Override per company (FOUND catturato subito dopo la SELECT).
  SELECT o.access_level, o.is_enabled, o.limit_value, o.price_override, o.expires_at INTO v_ov
  FROM public.company_feature_overrides o
  WHERE o.company_id = p_company_id AND o.feature_key = p_feature_key
    AND (o.expires_at IS NULL OR o.expires_at > now());
  v_has_ov := FOUND;

  IF v_has_ov AND v_ov.is_enabled IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_ov.access_level = 'enabled', v_ov.is_enabled),
      COALESCE(v_ov.access_level, (CASE WHEN v_ov.is_enabled THEN 'enabled' ELSE 'disabled' END)::feature_access_level),
      'override'::text, v_ov.limit_value::numeric, v_ov.price_override::numeric, v_ov.expires_at, v_supports_preview;
    RETURN;
  END IF;

  -- 2. Plan default
  IF v_plan_id IS NOT NULL THEN
    SELECT d.access_level, d.is_enabled, d.limit_value INTO v_pd
    FROM public.plan_feature_defaults d
    WHERE d.plan_id = v_plan_id AND d.feature_key = p_feature_key;
    v_has_pd := FOUND;
  END IF;

  IF v_has_pd THEN
    RETURN QUERY SELECT
      COALESCE(v_pd.access_level = 'enabled', v_pd.is_enabled),
      COALESCE(v_pd.access_level, (CASE WHEN v_pd.is_enabled THEN 'enabled' ELSE 'disabled' END)::feature_access_level),
      'plan_default'::text, v_pd.limit_value::numeric, NULL::numeric, NULL::TIMESTAMPTZ, v_supports_preview;
    RETURN;
  END IF;

  -- 3. plans_included (slug del piano nell'array della feature)
  IF v_plan_slug IS NOT NULL AND v_flag.plans_included IS NOT NULL AND v_plan_slug = ANY(v_flag.plans_included) THEN
    RETURN QUERY SELECT true, 'enabled'::feature_access_level, 'plan'::text, NULL::numeric, NULL::numeric, NULL::TIMESTAMPTZ, v_supports_preview;
    RETURN;
  END IF;

  -- 4. default_value della feature
  RETURN QUERY SELECT
    COALESCE(v_flag.default_value, false),
    (CASE WHEN COALESCE(v_flag.default_value, false) THEN 'enabled' ELSE 'disabled' END)::feature_access_level,
    'default'::text, NULL::numeric, NULL::numeric, NULL::TIMESTAMPTZ, v_supports_preview;
END;
$function$;
