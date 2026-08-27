-- ============================================================================
-- FIX multi-tenant: due RPC leggevano dati altrui (sconti + limiti piano).
--
-- compute_max_discount: passando l'id di un preventivo di un'ALTRA azienda ne
-- ritornava il subtotale reale, il margine pre-sconto e le regole di sconto.
-- Provato in prod (utente Demo 2 su un preventivo dell'azienda 778a…, total
-- 5.808): ritornava total 5.280 e margine_pct_pre 20.
--
-- check_plan_limit: passando la company altrui ne rivelava il nome del piano
-- e i conteggi risorse (ordini/utenti). Provato: piano + current di un'altra
-- azienda.
--
-- Fix: guardia user_can_access_company. compute_max_discount la mette DOPO aver
-- caricato la company dal preventivo, e ritorna lo STESSO 'quote_not_found' del
-- caso inesistente (niente enumerazione). service_role e membri legittimi
-- passano. Corpi altrimenti identici all'originale.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_max_discount(p_quote_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_total NUMERIC;
  v_salesperson_id UUID;
  v_tipo_lavoro TEXT;
  v_client_tags TEXT[];
  v_margine_pct NUMERIC;
  v_rule RECORD;
  v_max_sconto NUMERIC := 100;
  v_approva_oltre NUMERIC := NULL;
  v_applied_rules JSONB := '[]'::jsonb;
BEGIN
  SELECT q.company_id, q.subtotal, q.salesperson_id,
         q.description,
         COALESCE(mc.tags, ARRAY[]::text[])
    INTO v_company_id, v_total, v_salesperson_id, v_tipo_lavoro, v_client_tags
  FROM public.quotes q
  LEFT JOIN public.marketing_contacts mc ON mc.id = q.contact_id
  WHERE q.id = p_quote_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'quote_not_found');
  END IF;

  -- Guardia multi-tenant: stesso errore del "non trovato" per non rivelare
  -- che il preventivo esiste in un'altra azienda.
  IF NOT public.user_can_access_company(v_company_id) THEN
    RETURN jsonb_build_object('error', 'quote_not_found');
  END IF;

  -- margine pct pre-sconto (da snapshot se presente; altrimenti stima prudente 20%)
  SELECT COALESCE(margine_pct_snapshot, 20) INTO v_margine_pct
    FROM public.quotes WHERE id = p_quote_id;

  FOR v_rule IN
    SELECT dr.*
      FROM public.discount_rules dr
     WHERE dr.company_id = v_company_id
       AND dr.is_active = true
       AND (dr.importo_min IS NULL OR COALESCE(v_total,0) >= dr.importo_min)
       AND (dr.importo_max IS NULL OR COALESCE(v_total,0) <= dr.importo_max)
       AND (dr.tipo_lavoro IS NULL OR dr.tipo_lavoro = v_tipo_lavoro)
       AND (
         dr.scope = 'globale'
         OR (dr.scope = 'per_commerciale' AND dr.salesperson_id = v_salesperson_id)
         OR (dr.scope = 'per_cliente_cat' AND dr.client_category = ANY(v_client_tags))
       )
     ORDER BY dr.priority ASC
  LOOP
    v_max_sconto := LEAST(
      v_max_sconto,
      v_rule.sconto_max_pct,
      GREATEST(0, v_margine_pct - v_rule.margine_min_pct)
    );
    IF v_rule.approva_oltre_pct IS NOT NULL THEN
      v_approva_oltre := LEAST(COALESCE(v_approva_oltre, v_rule.approva_oltre_pct), v_rule.approva_oltre_pct);
    END IF;
    v_applied_rules := v_applied_rules || jsonb_build_object(
      'id', v_rule.id, 'name', v_rule.name, 'sconto_max_pct', v_rule.sconto_max_pct,
      'margine_min_pct', v_rule.margine_min_pct, 'scope', v_rule.scope
    );
  END LOOP;

  IF v_max_sconto = 100 AND jsonb_array_length(v_applied_rules) = 0 THEN
    v_max_sconto := 10;
  END IF;

  RETURN jsonb_build_object(
    'max_sconto_pct', ROUND(v_max_sconto::numeric, 2),
    'approva_oltre_pct', v_approva_oltre,
    'margine_pct_pre', v_margine_pct,
    'applied_rules', v_applied_rules,
    'total', v_total
  );
END;
$function$;

-- check_plan_limit: guardia in testa (i limiti sono per-azienda; la propria
-- passa, service_role passa). Corpo identico all'originale.
CREATE OR REPLACE FUNCTION public.check_plan_limit(p_company_id uuid, p_resource_type text, p_increment integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_name    text;
  v_max_value    integer;
  v_current      integer := 0;
  v_allowed      boolean;
  v_override     integer;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    sp.name,
    CASE p_resource_type
      WHEN 'orders'     THEN sp.max_orders
      WHEN 'users'      THEN sp.max_users
      WHEN 'storage_mb' THEN sp.max_storage_mb
      ELSE -1
    END
  INTO v_plan_name, v_max_value
  FROM company_subscriptions cs
  JOIN subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = p_company_id
    AND cs.status = 'active'
  ORDER BY cs.created_at DESC
  LIMIT 1;

  IF v_plan_name IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'plan_name', 'trial');
  END IF;

  SELECT CASE p_resource_type WHEN 'orders' THEN custom_max_orders ELSE NULL END
  INTO v_override
  FROM company_billing_overrides
  WHERE company_id = p_company_id;

  IF v_override IS NOT NULL THEN
    v_max_value := v_override;
  END IF;

  IF v_max_value = -1 THEN
    RETURN jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'plan_name', v_plan_name);
  END IF;

  IF p_resource_type = 'orders' THEN
    SELECT COUNT(*)::integer INTO v_current FROM orders WHERE company_id = p_company_id;
  ELSIF p_resource_type = 'users' THEN
    SELECT COUNT(*)::integer INTO v_current FROM profiles WHERE company_id = p_company_id;
  ELSIF p_resource_type = 'storage_mb' THEN
    SELECT COALESCE(SUM(COALESCE(size_bytes, 0)) / 1048576, 0)::integer INTO v_current
    FROM company_documents WHERE company_id = p_company_id;
  END IF;

  v_allowed := (v_current + p_increment) <= v_max_value;

  RETURN jsonb_build_object('allowed', v_allowed, 'current', v_current, 'limit', v_max_value, 'plan_name', v_plan_name);
END;
$function$;
