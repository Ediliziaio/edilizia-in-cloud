-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-19 — AI Operations Optimization (FASE F)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. RPC silvio_employees_workload (carico corrente per ogni operaio)
-- 2. RPC silvio_team_availability (operai disponibili per data range)
-- 3. RPC silvio_pricing_suggestion (analisi prezzi storici per voce listino)
-- 4. AI Router config: ai_allocazione_operai, ai_pricing_suggest
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) RPC: silvio_employees_workload
--    Per ogni operaio: ore lavorate ultimi 30gg + ordini attualmente assegnati
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_employees_workload(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.utilizzo_pct DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      e.id AS employee_id,
      e.first_name || ' ' || e.last_name AS nome,
      e.role_type,
      e.area,
      e.monthly_hours AS ore_mensili,
      COALESCE(SUM(oe.hours_worked), 0) AS ore_30gg,
      COUNT(DISTINCT CASE WHEN o.status IN ('nuovo','in_corso','in_lavorazione') THEN oe.order_id END) AS ordini_attivi,
      ROUND(
        COALESCE(SUM(oe.hours_worked), 0)::numeric / NULLIF(e.monthly_hours, 0) * 100, 1
      ) AS utilizzo_pct,
      CASE
        WHEN COALESCE(SUM(oe.hours_worked), 0) >= COALESCE(e.monthly_hours, 160) * 1.0 THEN 'overload'
        WHEN COALESCE(SUM(oe.hours_worked), 0) >= COALESCE(e.monthly_hours, 160) * 0.8 THEN 'pieno'
        WHEN COALESCE(SUM(oe.hours_worked), 0) >= COALESCE(e.monthly_hours, 160) * 0.5 THEN 'medio'
        WHEN COALESCE(SUM(oe.hours_worked), 0) >= COALESCE(e.monthly_hours, 160) * 0.2 THEN 'leggero'
        ELSE 'libero'
      END AS stato_carico
    FROM public.employees e
    LEFT JOIN public.order_employees oe
      ON oe.employee_id = e.id
      AND oe.created_at > now() - interval '30 days'
    LEFT JOIN public.orders o ON o.id = oe.order_id
    WHERE e.company_id = p_company_id
      AND COALESCE(e.is_active, true) = true
    GROUP BY e.id, e.first_name, e.last_name, e.role_type, e.area, e.monthly_hours
  ) s;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_employees_workload(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_employees_workload(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: silvio_team_availability (free for date range)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_team_availability(
  p_company_id uuid, p_data_inizio date DEFAULT CURRENT_DATE,
  p_data_fine date DEFAULT (CURRENT_DATE + INTERVAL '14 days')
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.disponibilita_pct DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      e.id AS employee_id,
      e.first_name || ' ' || e.last_name AS nome,
      e.role_type,
      e.area,
      COUNT(DISTINCT oca.order_id) AS cantieri_assegnati_periodo,
      ROUND(GREATEST(0, 100 - COUNT(DISTINCT oca.order_id) * 30.0)) AS disponibilita_pct,
      CASE
        WHEN COUNT(DISTINCT oca.order_id) = 0 THEN 'libero'
        WHEN COUNT(DISTINCT oca.order_id) = 1 THEN 'leggero'
        WHEN COUNT(DISTINCT oca.order_id) = 2 THEN 'medio'
        ELSE 'pieno'
      END AS stato
    FROM public.employees e
    LEFT JOIN public.order_campo_assignments oca
      ON oca.user_id = e.user_id
      AND oca.company_id = e.company_id
      AND (
        (oca.data_inizio, oca.data_fine_prevista) OVERLAPS (p_data_inizio, p_data_fine + 1)
        OR (oca.data_inizio IS NULL OR oca.data_fine_prevista IS NULL)
      )
    WHERE e.company_id = p_company_id
      AND COALESCE(e.is_active, true) = true
      AND e.user_id IS NOT NULL
    GROUP BY e.id, e.first_name, e.last_name, e.role_type, e.area, e.user_id
  ) s;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_team_availability(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_team_availability(uuid, date, date) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_pricing_suggestion
--    Per una voce di listino: prezzo medio venduto, last sold, margin avg
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_pricing_history(
  p_company_id uuid, p_item_name text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_search text := '%' || lower(p_item_name) || '%';
BEGIN
  SELECT row_to_json(s) INTO v_result
  FROM (
    SELECT
      COUNT(*) AS volte_venduta,
      ROUND(AVG(oi.unit_price)::numeric, 2) AS prezzo_medio_eur,
      ROUND(MAX(oi.unit_price)::numeric, 2) AS prezzo_max_eur,
      ROUND(MIN(oi.unit_price)::numeric, 2) AS prezzo_min_eur,
      ROUND(AVG(oi.purchase_price)::numeric, 2) AS costo_medio_eur,
      ROUND(AVG(oi.unit_price - COALESCE(oi.purchase_price, 0))::numeric, 2) AS margine_medio_eur,
      ROUND(
        AVG(
          CASE WHEN COALESCE(oi.purchase_price, 0) > 0
            THEN (oi.unit_price - oi.purchase_price) / oi.purchase_price * 100
            ELSE NULL
          END
        )::numeric, 1
      ) AS markup_medio_pct,
      MAX(oi.created_at::date) AS ultima_vendita,
      MIN(oi.created_at::date) AS prima_vendita
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.company_id = p_company_id
      AND COALESCE(oi.unit_price, 0) > 0
      AND lower(oi.name) LIKE v_search
  ) s;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_pricing_history(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_pricing_history(uuid, text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) AI Router config
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES
  (
    'ai_allocazione_operai',
    'Allocazione Operai AI',
    'Suggerisce quali operai assegnare a un nuovo cantiere/ordine',
    'deepseek/deepseek-chat-v3.1',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.2,"max_tokens":600}'::jsonb,
    't1_economic',
    'operations',
    true
  ),
  (
    'ai_pricing_suggest',
    'Pricing Suggestion AI',
    'Suggerisce prezzo ottimale combinando storico, costo, margine target',
    'deepseek/deepseek-chat-v3.1',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.2,"max_tokens":500}'::jsonb,
    't1_economic',
    'sales',
    true
  )
ON CONFLICT (task_key) DO UPDATE
  SET task_label = EXCLUDED.task_label,
      task_description = EXCLUDED.task_description,
      primary_model = EXCLUDED.primary_model,
      fallback_models = EXCLUDED.fallback_models,
      default_params = EXCLUDED.default_params,
      tier_key = EXCLUDED.tier_key,
      category = EXCLUDED.category;

-- Verifica
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config
    WHERE task_key IN ('ai_allocazione_operai','ai_pricing_suggest');
  RAISE NOTICE 'AI Router operations: % task registrati (atteso 2)', v_cnt;
END $$;
