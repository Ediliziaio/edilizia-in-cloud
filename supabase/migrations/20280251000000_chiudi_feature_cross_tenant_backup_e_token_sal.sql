-- Secondo giro dell'audit superadmin. Tre buchi distinti, tutti verificati in
-- prod prima del fix.
--
-- 1. resolve_company_features / resolve_company_feature: NESSUNA guardia.
--    Chiunque — anche non loggato — passando un company_id qualsiasi otteneva
--    la configurazione completa di quell'azienda: quali moduli ha attivi, i
--    limiti, le scadenze e soprattutto `price_override`, cioe' il prezzo
--    negoziato con quel cliente. Provato: 54 feature restituite per un'azienda
--    terza, 52 delle quali specifiche (source override/plan_default).
--    Guardia: user_can_access_company — la stessa gia' usata da
--    topup_service_credits & co. Passano propria azienda, super_admin,
--    service_role, accesso multi-azienda e commercialista. Nessuna pagina
--    pubblica usa le feature flag (verificato), quindi non si rompe nulla.
--
-- 2. _backup_scadenze_orfane_20260827: tabella di backup lasciata SENZA RLS
--    dalla bonifica del 27/08. 123 righe leggibili da un anonimo, con
--    company_id, importi, scadenze, stato pagamento e descrizioni tipo
--    "Fattura 11 - <nome cliente>". La tabella non si tocca (e' un backup):
--    si accende RLS e senza policy resta visibile al solo service_role.
--
-- 3. sal_signature_tokens: policy anon che esponeva OGNI token valido non
--    ancora firmato (`token IS NOT NULL AND expires_at > now() AND signed_at
--    IS NULL`), senza confrontarlo con quello richiesto — la colonna `token`
--    e' nella tabella, quindi bastava elencarli per firmare i SAL altrui.
--    Oggi la tabella e' vuota, ma il buco si apriva al primo invio.
--    La policy e' anche INUTILE: FirmaSal.tsx passa dalle RPC
--    sal_view_by_token / sal_sign_with_token, non legge mai la tabella.
--    Si elimina.
--
-- NB: le policy anon su quotes/quote_items NON sono toccate: quelle il token
-- lo confrontano davvero (signature_token = request.header.x-quote-token) e
-- sono il modello corretto. Resta aperto ordini_variazione, che invece legge e
-- SCRIVE la tabella in diretta con una policy 'firma_token IS NOT NULL':
-- richiede anche una modifica a FirmaOdV.tsx e va fatto a parte.

-- ── 1. resolve_company_features (plurale) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_company_features(p_company_id uuid)
 RETURNS TABLE(feature_key text, is_enabled boolean, source text, limit_value integer, price_override numeric, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id   uuid;
  v_plan_slug text;
BEGIN
  -- [audit sicurezza 2026-08-31] guardia anti cross-tenant
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

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
    CASE
      WHEN ov.is_enabled IS NOT NULL THEN ov.is_enabled
      WHEN pd.is_enabled IS NOT NULL THEN pd.is_enabled
      WHEN v_plan_slug IS NOT NULL
           AND f.plans_included IS NOT NULL
           AND v_plan_slug = ANY(f.plans_included) THEN true
      ELSE COALESCE(f.default_value, false)
    END AS is_enabled,
    CASE
      WHEN ov.feature_key IS NOT NULL AND ov.is_enabled IS NOT NULL THEN 'override'
      WHEN pd.feature_key IS NOT NULL THEN 'plan_default'
      WHEN v_plan_slug IS NOT NULL
           AND f.plans_included IS NOT NULL
           AND v_plan_slug = ANY(f.plans_included) THEN 'plan'
      ELSE 'default'
    END AS source,
    COALESCE(ov.limit_value, pd.limit_value) AS limit_value,
    ov.price_override                          AS price_override,
    ov.expires_at                              AS expires_at
    FROM public.platform_feature_flags f
    LEFT JOIN ov ON ov.feature_key = f.key
    LEFT JOIN pd ON pd.feature_key = f.key
  ORDER BY f.sort_order NULLS LAST, f.key;
END;
$function$;

-- ── 2. resolve_company_feature (singolare) ───────────────────────────────
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
  -- [audit sicurezza 2026-08-31] guardia anti cross-tenant
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  SELECT sp.id, sp.slug INTO v_plan_id, v_plan_slug
  FROM public.companies c
  LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
  WHERE c.id = p_company_id;

  SELECT pff.default_value, pff.plans_included, pff.supports_preview INTO v_flag
  FROM public.platform_feature_flags pff WHERE pff.key = p_feature_key;
  v_supports_preview := COALESCE(v_flag.supports_preview, true);

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

  IF v_plan_slug IS NOT NULL AND v_flag.plans_included IS NOT NULL AND v_plan_slug = ANY(v_flag.plans_included) THEN
    RETURN QUERY SELECT true, 'enabled'::feature_access_level, 'plan'::text, NULL::numeric, NULL::numeric, NULL::TIMESTAMPTZ, v_supports_preview;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_flag.default_value, false),
    (CASE WHEN COALESCE(v_flag.default_value, false) THEN 'enabled' ELSE 'disabled' END)::feature_access_level,
    'default'::text, NULL::numeric, NULL::numeric, NULL::TIMESTAMPTZ, v_supports_preview;
END;
$function$;

-- ── 3. tabella di backup senza RLS ───────────────────────────────────────
ALTER TABLE public._backup_scadenze_orfane_20260827 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public._backup_scadenze_orfane_20260827 IS
  'Backup della bonifica scadenze orfane del 27/08/2026. RLS acceso il 31/08/2026: era leggibile da anon con dentro importi e nomi clienti. Nessuna policy = solo service_role.';

-- ── 4. policy anon inutile e pericolosa sui token SAL ────────────────────
DROP POLICY IF EXISTS sal_signature_tokens_anon_read ON public.sal_signature_tokens;
