-- ============================================================================
-- FIX multi-tenant: RPC SECURITY DEFINER senza guardia company.
--
-- Otto funzioni SECURITY DEFINER, invocabili via API da qualsiasi utente
-- loggato (GRANT authenticated), leggevano dati di UN'ALTRA azienda passando
-- semplicemente il suo id. Provato in prod col token di un utente demo
-- (azienda Demo 2) contro id di altre aziende:
--   · costo_orario_dipendente  → 13,71 €/h di un dipendente altrui (SALARIO)
--   · brain_get_facts          → clienti, fatturato e crediti del concorrente
--   · brain_stats              → statistiche KB dell'altra azienda
--   · check_company_budget/v2  → piano commerciale e spesa AI altrui
--   · generate_oda_number,
--     generate_quote_number,
--     next_contratto_numero    → progressivi = conteggio documenti altrui
--
-- Fix: guardia `user_can_access_company(...)` in testa. L'helper ammette già
-- service_role (le edge function non si rompono), super_admin, la company
-- dell'utente, il multi-accesso e il commercialista — quindi le chiamate
-- legittime (proprie o server-side) passano, le altrui no. I corpi restano
-- identici all'originale: cambia solo il controllo d'accesso a monte.
-- ============================================================================

-- 1. costo_orario_dipendente: prende l'id del dipendente, non la company →
--    la guardia va nella WHERE (deriva la company dal dipendente). Senza
--    accesso: nessuna riga → NULL, come per un id inesistente. Resta SQL.
CREATE OR REPLACE FUNCTION public.costo_orario_dipendente(p_employee_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when e.costo_orario is not null and e.costo_orario > 0
      then e.costo_orario
    when coalesce(e.gross_salary, 0) > 0 and coalesce(e.monthly_hours, 0) > 0
      then round((e.gross_salary * (1 + coalesce(e.inps_rate, 28) / 100.0)) / e.monthly_hours, 2)
    else 0
  end
  from employees e
  where e.id = p_employee_id
    and public.user_can_access_company(e.company_id)
$function$;

-- 2. brain_get_facts
CREATE OR REPLACE FUNCTION public.brain_get_facts(p_company_id uuid, p_min_confidence numeric DEFAULT 0.5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_facts jsonb;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_object_agg(fact_key, fact_value) INTO v_facts
  FROM public.ai_brain_facts
  WHERE company_id = p_company_id
    AND confidence >= p_min_confidence;

  RETURN COALESCE(v_facts, '{}'::jsonb);
END;
$function$;

-- 3. brain_stats (la parte 'universal' è KB condivisa: la guardia sulla
--    company non la nasconde ai membri legittimi, che passano la propria)
CREATE OR REPLACE FUNCTION public.brain_stats(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_total int;
  v_company_with_emb int;
  v_universal_total int;
  v_universal_with_emb int;
  v_by_source jsonb;
  v_by_category jsonb;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*) FILTER (WHERE scope = 'company' AND company_id = p_company_id),
    count(*) FILTER (WHERE scope = 'company' AND company_id = p_company_id AND embedding IS NOT NULL),
    count(*) FILTER (WHERE scope = 'universal'),
    count(*) FILTER (WHERE scope = 'universal' AND embedding IS NOT NULL)
  INTO v_company_total, v_company_with_emb, v_universal_total, v_universal_with_emb
  FROM public.ai_brain_documents;

  SELECT jsonb_object_agg(source_type, c) INTO v_by_source
  FROM (
    SELECT source_type, count(*) AS c FROM public.ai_brain_documents
    WHERE (scope = 'company' AND company_id = p_company_id) OR scope = 'universal'
    GROUP BY 1
  ) x;

  SELECT jsonb_object_agg(category, c) INTO v_by_category
  FROM (
    SELECT COALESCE(category, 'uncategorized') AS category, count(*) AS c
    FROM public.ai_brain_documents
    WHERE scope = 'universal'
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'company', jsonb_build_object(
      'totale', v_company_total,
      'con_embedding', v_company_with_emb
    ),
    'universal', jsonb_build_object(
      'totale', v_universal_total,
      'con_embedding', v_universal_with_emb,
      'breakdown_categoria', COALESCE(v_by_category, '{}'::jsonb)
    ),
    'breakdown_source', COALESCE(v_by_source, '{}'::jsonb)
  );
END;
$function$;

-- 4. check_company_budget
CREATE OR REPLACE FUNCTION public.check_company_budget(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'plan_key', plan_key,
    'budget_eur', monthly_budget_eur,
    'used_eur', total_billed_eur,
    'usage_pct', usage_pct,
    'cap_status', cap_status,
    'soft_cap_pct', soft_cap_pct,
    'hard_cap_pct', hard_cap_pct,
    'on_soft_cap', on_soft_cap,
    'on_hard_cap', on_hard_cap,
    'usage_month', usage_month
  ) INTO v
    FROM public.company_ai_usage_month
   WHERE company_id = p_company_id
     AND usage_month = date_trunc('month', NOW())
   LIMIT 1;

  IF v IS NULL THEN
    SELECT jsonb_build_object(
      'plan_key', sp.slug,
      'budget_eur', pb.monthly_budget_eur,
      'used_eur', 0,
      'usage_pct', 0,
      'cap_status', CASE WHEN pb.monthly_budget_eur IS NULL THEN 'no_budget' ELSE 'ok' END,
      'soft_cap_pct', pb.soft_cap_pct,
      'hard_cap_pct', pb.hard_cap_pct,
      'on_soft_cap', pb.on_soft_cap,
      'on_hard_cap', pb.on_hard_cap,
      'usage_month', date_trunc('month', NOW())
    ) INTO v
      FROM public.companies c
      LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
      LEFT JOIN public.plan_ai_budgets pb ON pb.plan_key = sp.slug
     WHERE c.id = p_company_id
     LIMIT 1;
  END IF;

  RETURN COALESCE(v, jsonb_build_object('cap_status', 'no_company', 'usage_pct', 0));
END $function$;

-- 5. check_company_budget_v2
CREATE OR REPLACE FUNCTION public.check_company_budget_v2(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_topups_eur numeric;
  v_effective_budget numeric;
  v_used_eur numeric;
  v_usage_pct numeric;
  v_cap_status text;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'plan_key', plan_key,
    'budget_eur', monthly_budget_eur,
    'used_eur', total_billed_eur,
    'usage_pct', usage_pct,
    'soft_cap_pct', soft_cap_pct,
    'hard_cap_pct', hard_cap_pct,
    'on_soft_cap', on_soft_cap,
    'on_hard_cap', on_hard_cap,
    'usage_month', usage_month
  ) INTO v
    FROM public.company_ai_usage_month
   WHERE company_id = p_company_id
     AND usage_month = date_trunc('month', NOW())
   LIMIT 1;

  IF v IS NULL THEN
    SELECT jsonb_build_object(
      'plan_key', sp.slug,
      'budget_eur', pb.monthly_budget_eur,
      'used_eur', 0,
      'usage_pct', 0,
      'soft_cap_pct', pb.soft_cap_pct,
      'hard_cap_pct', pb.hard_cap_pct,
      'on_soft_cap', pb.on_soft_cap,
      'on_hard_cap', pb.on_hard_cap,
      'usage_month', date_trunc('month', NOW())
    ) INTO v
      FROM public.companies c
      LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
      LEFT JOIN public.plan_ai_budgets pb ON pb.plan_key = sp.slug
     WHERE c.id = p_company_id
     LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(credits_eur), 0) INTO v_topups_eur
    FROM public.ai_payg_topups
   WHERE company_id = p_company_id
     AND status = 'succeeded'
     AND applied_at >= date_trunc('month', NOW());

  v_effective_budget := COALESCE((v->>'budget_eur')::numeric, 0) + v_topups_eur;
  v_used_eur := COALESCE((v->>'used_eur')::numeric, 0);
  v_usage_pct := CASE
    WHEN v_effective_budget = 0 THEN 0
    ELSE ROUND((v_used_eur / v_effective_budget * 100)::numeric, 2)
  END;

  v_cap_status := CASE
    WHEN v_effective_budget = 0 THEN 'no_budget'
    WHEN v_usage_pct >= COALESCE((v->>'hard_cap_pct')::int, 100) THEN 'hard_cap'
    WHEN v_usage_pct >= COALESCE((v->>'soft_cap_pct')::int, 80) THEN 'soft_cap'
    ELSE 'ok'
  END;

  RETURN COALESCE(v, '{}'::jsonb) || jsonb_build_object(
    'topups_eur', v_topups_eur,
    'effective_budget_eur', v_effective_budget,
    'effective_usage_pct', v_usage_pct,
    'effective_cap_status', v_cap_status
  );
END $function$;

-- 6. generate_oda_number
CREATE OR REPLACE FUNCTION public.generate_oda_number(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year TEXT;
  v_next INTEGER;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;

  SELECT COALESCE(MAX(substring(oda_number FROM '^ODA-' || v_year || '-(\d+)$')::INTEGER), 0) + 1
    INTO v_next
  FROM purchase_orders
  WHERE company_id = p_company_id
    AND oda_number ~ ('^ODA-' || v_year || '-\d+$');

  RETURN 'ODA-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$function$;

-- 7. generate_quote_number
CREATE OR REPLACE FUNCTION public.generate_quote_number(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM now())::TEXT;
  v_count INTEGER;
  v_number TEXT;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) + 1 INTO v_count
  FROM public.quotes
  WHERE company_id = p_company_id
    AND quote_number LIKE 'OFF-' || v_year || '-%';

  v_number := 'OFF-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN v_number;
END;
$function$;

-- 8. next_contratto_numero
CREATE OR REPLACE FUNCTION public.next_contratto_numero(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_count int;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) + 1 INTO v_count
  FROM public.contratti_documents
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM created_at) = v_year;
  RETURN format('CON-%s-%s', v_year, lpad(v_count::text, 4, '0'));
END;
$function$;
