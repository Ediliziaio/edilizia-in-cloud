-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-17 — AI Lead Scoring + Customer LTV (FASE D)
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge:
--   1. Campi AI scoring su marketing_contacts (ai_score, reasoning, next_action)
--   2. Tabella customer_ltv_snapshots (predizione LTV per cliente)
--   3. RPC silvio_compute_customer_ltv (calcolo deterministico baseline)
--   4. RPC silvio_top_at_risk_customers (clienti dormienti / a rischio churn)
--   5. AI Router config: lead_score, customer_ltv_predict
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Campi AI scoring su marketing_contacts
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS ai_score int,
  ADD COLUMN IF NOT EXISTS ai_score_tier text CHECK (ai_score_tier IN ('hot','warm','cold','dormant')),
  ADD COLUMN IF NOT EXISTS ai_score_reasoning text,
  ADD COLUMN IF NOT EXISTS ai_next_action text,
  ADD COLUMN IF NOT EXISTS ai_intent_signals jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_predicted_value_eur numeric(12,2),
  ADD COLUMN IF NOT EXISTS ai_scored_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_score_model text;

CREATE INDEX IF NOT EXISTS idx_mkt_contacts_ai_score
  ON public.marketing_contacts(company_id, ai_score DESC NULLS LAST)
  WHERE ai_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_contacts_ai_tier
  ON public.marketing_contacts(company_id, ai_score_tier);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Tabella snapshot LTV per cliente (orders.client_*)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_ltv_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_key text NOT NULL,                  -- match su orders.client_name+client_company
  client_display_name text,
  ordini_totali int DEFAULT 0,
  fatturato_storico_eur numeric(15,2) DEFAULT 0,
  ultimo_ordine_data date,
  primo_ordine_data date,
  giorni_dall_ultimo_ordine int,
  frequenza_ordini_mesi numeric(6,2),       -- media gg/12 tra ordini
  ticket_medio_eur numeric(12,2),
  payment_delay_avg_gg int,
  ltv_predetto_12m_eur numeric(12,2),       -- stima 12 mesi
  ltv_predetto_24m_eur numeric(12,2),
  churn_risk text CHECK (churn_risk IN ('basso','medio','alto','perso')),
  azione_consigliata text,
  ai_reasoning text,
  ai_model_used text,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ltv_company_value
  ON public.customer_ltv_snapshots(company_id, ltv_predetto_12m_eur DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ltv_client_key
  ON public.customer_ltv_snapshots(company_id, client_key);
CREATE INDEX IF NOT EXISTS idx_ltv_risk
  ON public.customer_ltv_snapshots(company_id, churn_risk)
  WHERE churn_risk IS NOT NULL;

-- RLS
ALTER TABLE public.customer_ltv_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ltv_select_company" ON public.customer_ltv_snapshots;
CREATE POLICY "ltv_select_company" ON public.customer_ltv_snapshots
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "ltv_modify_admin" ON public.customer_ltv_snapshots;
CREATE POLICY "ltv_modify_admin" ON public.customer_ltv_snapshots
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin')
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_compute_customer_ltv
--     Calcolo deterministico baseline LTV per ogni cliente con almeno 1 ordine.
--     Salva snapshot in customer_ltv_snapshots (UPSERT su client_key).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_compute_customer_ltv(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_total_pred_12m numeric := 0;
  v_top_client text;
  v_top_value numeric;
BEGIN
  -- Aggregazione per cliente
  WITH agg AS (
    SELECT
      lower(trim(COALESCE(client_company, client_name, ''))) AS client_key,
      MAX(COALESCE(client_company, client_name)) AS display_name,
      COUNT(*) AS ordini,
      SUM(COALESCE(total_amount, 0)) AS fatturato,
      MIN(created_at::date) AS primo_ordine,
      MAX(created_at::date) AS ultimo_ordine,
      AVG(COALESCE(total_amount, 0)) AS ticket_medio,
      AVG(
        CASE WHEN balance_paid_date IS NOT NULL AND balance_expected_date IS NOT NULL
          THEN (balance_paid_date::date - balance_expected_date)
          ELSE NULL
        END
      )::int AS payment_delay_avg
    FROM public.orders
    WHERE company_id = p_company_id
      AND COALESCE(NULLIF(client_company, ''), client_name) IS NOT NULL
    GROUP BY lower(trim(COALESCE(client_company, client_name, '')))
    HAVING COUNT(*) >= 1
  ),
  enriched AS (
    SELECT
      a.client_key, a.display_name, a.ordini, a.fatturato,
      a.primo_ordine, a.ultimo_ordine, a.ticket_medio, a.payment_delay_avg,
      (CURRENT_DATE - a.ultimo_ordine) AS gg_dall_ultimo,
      CASE
        WHEN a.ordini > 1 THEN
          (a.ultimo_ordine - a.primo_ordine)::numeric / NULLIF(a.ordini - 1, 0) / 30.0
        ELSE NULL
      END AS frequenza_mesi,
      -- Predizione semplice: ticket_medio * (12 / frequenza_mesi) se freq nota
      -- altrimenti: 1 ordine in 12m se non dormiente, 0 se dormiente
      CASE
        WHEN (CURRENT_DATE - a.ultimo_ordine) > 365 THEN 0
        WHEN a.ordini = 1 THEN
          CASE WHEN (CURRENT_DATE - a.ultimo_ordine) < 90
            THEN a.ticket_medio * 0.5  -- 50% prob nuovo ordine
            ELSE a.ticket_medio * 0.2  -- 20% prob
          END
        ELSE
          a.ticket_medio * GREATEST(0.1, LEAST(4.0,
            12.0 / NULLIF((a.ultimo_ordine - a.primo_ordine)::numeric / NULLIF(a.ordini - 1, 0) / 30.0, 0)
          ))
      END AS ltv_12m,
      CASE
        WHEN (CURRENT_DATE - a.ultimo_ordine) > 730 THEN 'perso'
        WHEN (CURRENT_DATE - a.ultimo_ordine) > 365 THEN 'alto'
        WHEN (CURRENT_DATE - a.ultimo_ordine) > 180 THEN 'medio'
        ELSE 'basso'
      END AS churn_risk,
      CASE
        WHEN (CURRENT_DATE - a.ultimo_ordine) > 365 THEN 'Riattiva con offerta dedicata o sconto'
        WHEN (CURRENT_DATE - a.ultimo_ordine) > 180 THEN 'Chiamata/email follow-up'
        WHEN a.ordini >= 3 THEN 'Cliente VIP: proposte upsell/cross-sell'
        WHEN a.ordini = 1 AND a.ticket_medio > 10000 THEN 'Cliente alto-valore: contatto personale'
        ELSE 'Mantieni relazione attiva'
      END AS azione
    FROM agg a
  )
  INSERT INTO public.customer_ltv_snapshots (
    company_id, client_key, client_display_name,
    ordini_totali, fatturato_storico_eur, ultimo_ordine_data, primo_ordine_data,
    giorni_dall_ultimo_ordine, frequenza_ordini_mesi, ticket_medio_eur,
    payment_delay_avg_gg, ltv_predetto_12m_eur, ltv_predetto_24m_eur,
    churn_risk, azione_consigliata, ai_model_used, computed_at
  )
  SELECT
    p_company_id, e.client_key, e.display_name,
    e.ordini, e.fatturato, e.ultimo_ordine, e.primo_ordine,
    e.gg_dall_ultimo, e.frequenza_mesi, e.ticket_medio,
    e.payment_delay_avg, ROUND(e.ltv_12m::numeric, 2), ROUND((e.ltv_12m * 1.7)::numeric, 2),
    e.churn_risk, e.azione, 'deterministic_v1', now()
  FROM enriched e
  ON CONFLICT (company_id, client_key) DO UPDATE
    SET client_display_name = EXCLUDED.client_display_name,
        ordini_totali = EXCLUDED.ordini_totali,
        fatturato_storico_eur = EXCLUDED.fatturato_storico_eur,
        ultimo_ordine_data = EXCLUDED.ultimo_ordine_data,
        primo_ordine_data = EXCLUDED.primo_ordine_data,
        giorni_dall_ultimo_ordine = EXCLUDED.giorni_dall_ultimo_ordine,
        frequenza_ordini_mesi = EXCLUDED.frequenza_ordini_mesi,
        ticket_medio_eur = EXCLUDED.ticket_medio_eur,
        payment_delay_avg_gg = EXCLUDED.payment_delay_avg_gg,
        ltv_predetto_12m_eur = EXCLUDED.ltv_predetto_12m_eur,
        ltv_predetto_24m_eur = EXCLUDED.ltv_predetto_24m_eur,
        churn_risk = EXCLUDED.churn_risk,
        azione_consigliata = EXCLUDED.azione_consigliata,
        computed_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT SUM(ltv_predetto_12m_eur), MAX(client_display_name), MAX(ltv_predetto_12m_eur)
    INTO v_total_pred_12m, v_top_client, v_top_value
  FROM public.customer_ltv_snapshots
  WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'clienti_analizzati', v_count,
    'ltv_totale_12m_eur', ROUND(COALESCE(v_total_pred_12m, 0), 2),
    'top_cliente', v_top_client,
    'top_cliente_ltv_eur', v_top_value
  );
END;
$$;

-- Unique index per UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS uq_ltv_company_client
  ON public.customer_ltv_snapshots(company_id, client_key);

REVOKE ALL ON FUNCTION public.silvio_compute_customer_ltv(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_compute_customer_ltv(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_top_at_risk_customers
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_top_at_risk_customers(
  p_company_id uuid, p_limit int DEFAULT 10
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
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.ordine), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      client_display_name AS cliente,
      ordini_totali,
      ROUND(fatturato_storico_eur::numeric, 2) AS fatturato_storico,
      ultimo_ordine_data,
      giorni_dall_ultimo_ordine AS gg_inattivo,
      churn_risk,
      ROUND(ltv_predetto_12m_eur::numeric, 2) AS ltv_12m,
      azione_consigliata,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE churn_risk
            WHEN 'alto' THEN 1
            WHEN 'medio' THEN 2
            WHEN 'perso' THEN 3
            ELSE 4
          END,
          fatturato_storico_eur DESC
      ) AS ordine
    FROM public.customer_ltv_snapshots
    WHERE company_id = p_company_id
      AND churn_risk IN ('medio','alto','perso')
    LIMIT p_limit
  ) s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_top_at_risk_customers(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_top_at_risk_customers(uuid, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_top_value_customers (i più preziosi 12m)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_top_value_customers(
  p_company_id uuid, p_limit int DEFAULT 10
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
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.ordine), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      client_display_name AS cliente,
      ordini_totali,
      ROUND(fatturato_storico_eur::numeric, 2) AS fatturato_storico,
      ROUND(ticket_medio_eur::numeric, 2) AS ticket_medio,
      ROUND(ltv_predetto_12m_eur::numeric, 2) AS ltv_12m,
      churn_risk,
      azione_consigliata,
      ROW_NUMBER() OVER (ORDER BY ltv_predetto_12m_eur DESC NULLS LAST) AS ordine
    FROM public.customer_ltv_snapshots
    WHERE company_id = p_company_id
      AND ltv_predetto_12m_eur > 0
    LIMIT p_limit
  ) s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_top_value_customers(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_top_value_customers(uuid, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) AI Router config: lead_score + customer_ltv_predict
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES
  (
    'lead_score',
    'Lead Scoring AI',
    'Analizza contatto e attribuisce punteggio 0-100 + reasoning + next action',
    'deepseek/deepseek-chat-v3.1',
    '["openai/gpt-4o-mini","anthropic/claude-haiku-4.5"]'::jsonb,
    '{"temperature":0.2,"max_tokens":800}'::jsonb,
    't1_economic',
    'sales',
    true
  ),
  (
    'customer_ltv_predict',
    'LTV Prediction AI',
    'Predice LTV cliente combinando dati ordini + comportamento pagamento',
    'openai/gpt-4o-mini',
    '["deepseek/deepseek-chat-v3.1"]'::jsonb,
    '{"temperature":0.1,"max_tokens":1200}'::jsonb,
    't1_economic',
    'analytics',
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

-- ───────────────────────────────────────────────────────────────────────────
-- Verifica
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config WHERE task_key IN ('lead_score','customer_ltv_predict');
  RAISE NOTICE 'AI Router lead/LTV: % task registrati (atteso 2)', v_cnt;
END $$;
