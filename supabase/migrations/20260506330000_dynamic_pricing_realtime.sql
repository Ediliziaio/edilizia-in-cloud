-- Dynamic Pricing Real-Time — fattori esterni che modulano il pricing
-- ════════════════════════════════════════════════════════════════════════════
-- Tracking prezzi materie prime, segnali concorrenti, fattori stagionali.
-- Viene letto da ai-pricing-engine per modulare le suggestioni.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Prezzi materie prime (alimentati da cron giornaliero)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_key text NOT NULL,    -- 'pvc', 'alluminio', 'vetro', 'acciaio', 'rame'
  index_date date NOT NULL,
  price_eur_kg numeric(10,4),
  price_eur_unit numeric(10,4),
  unit text,                      -- 'kg', 't', 'mq', 'ml'
  source text,                    -- 'lme', 'platts', 'manual', 'ai-scrape'
  source_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_material_index_date UNIQUE (material_key, index_date, source)
);

CREATE INDEX IF NOT EXISTS idx_material_price_key_date
  ON public.material_price_index(material_key, index_date DESC);

ALTER TABLE public.material_price_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_price_read ON public.material_price_index;
CREATE POLICY material_price_read ON public.material_price_index
  FOR SELECT USING (true);  -- dato pubblico, leggibile da tutti

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Segnali concorrenti (alimentati manualmente o via scraping AI)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitor_pricing_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  competitor_name text NOT NULL,
  product_category text NOT NULL,    -- 'finestre_pvc', 'porte_blindate', 'tende', 'caldaia', ...
  zone text,                          -- area geografica: provincia o regione

  signal_type text CHECK (signal_type IN ('price_increase', 'price_decrease', 'promotion', 'new_product', 'market_share')),
  signal_value numeric,
  signal_unit text,                   -- 'percentage', 'euro_absolute', 'days_lead_time'
  signal_description text,

  source text,                        -- 'manual', 'ai_lead_signal', 'visit_debrief', 'web_scrape'
  source_ref_id uuid,                 -- es. id di commercial_visit_debrief

  observed_at date NOT NULL DEFAULT current_date,
  expires_at date,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_competitor_signals_company_category
  ON public.competitor_pricing_signals(company_id, product_category, observed_at DESC);

ALTER TABLE public.competitor_pricing_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS competitor_signals_company ON public.competitor_pricing_signals;
CREATE POLICY competitor_signals_company ON public.competitor_pricing_signals
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Demand index per company (calcolato da AI cron)
-- Quanti preventivi stanno entrando rispetto allo storico
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.demand_index_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,

  -- Volumi
  quotes_count_30d int DEFAULT 0,
  quotes_count_30d_prev_year int DEFAULT 0,
  quotes_count_avg_3y_30d int DEFAULT 0,

  pipeline_value_eur numeric(14,2) DEFAULT 0,
  pipeline_value_prev_year_eur numeric(14,2) DEFAULT 0,

  -- Indici (1.0 = in linea con storico)
  demand_index numeric(4,2) DEFAULT 1.0,
  capacity_utilization_pct numeric(5,2),

  -- Stagione
  season_factor numeric(4,2) DEFAULT 1.0,    -- 1.05 alta domanda, 0.95 bassa
  season_label text,

  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_demand_snapshot UNIQUE (company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_demand_company_date
  ON public.demand_index_snapshots(company_id, snapshot_date DESC);

ALTER TABLE public.demand_index_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demand_index_company ON public.demand_index_snapshots;
CREATE POLICY demand_index_company ON public.demand_index_snapshots
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: silvio_tool_get_dynamic_pricing_factors
-- Aggrega tutti i fattori per arricchire il prompt del pricing engine
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_get_dynamic_pricing_factors(
  p_company_id uuid,
  p_product_category text DEFAULT NULL,
  p_material_keys text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_demand record;
  v_materials jsonb;
  v_competitors jsonb;
  v_suggested_pct numeric := 0;
  v_reasoning text[] := ARRAY[]::text[];
BEGIN
  -- Demand index più recente
  SELECT * INTO v_demand
  FROM public.demand_index_snapshots
  WHERE company_id = p_company_id
  ORDER BY snapshot_date DESC LIMIT 1;

  IF v_demand.demand_index IS NOT NULL THEN
    IF v_demand.demand_index > 1.20 THEN
      v_suggested_pct := v_suggested_pct + 5;
      v_reasoning := array_append(v_reasoning,
        format('Domanda alta: %s%% sopra storico', round((v_demand.demand_index - 1) * 100)));
    ELSIF v_demand.demand_index < 0.80 THEN
      v_suggested_pct := v_suggested_pct - 3;
      v_reasoning := array_append(v_reasoning,
        format('Domanda bassa: %s%% sotto storico', round((1 - v_demand.demand_index) * 100)));
    END IF;
  END IF;

  IF v_demand.season_factor IS NOT NULL AND v_demand.season_factor > 1.0 THEN
    v_suggested_pct := v_suggested_pct + ((v_demand.season_factor - 1) * 100);
    v_reasoning := array_append(v_reasoning,
      format('Stagione %s: +%s%%', COALESCE(v_demand.season_label, 'alta'),
             round((v_demand.season_factor - 1) * 100)));
  END IF;

  IF v_demand.capacity_utilization_pct IS NOT NULL AND v_demand.capacity_utilization_pct > 90 THEN
    v_suggested_pct := v_suggested_pct + 8;
    v_reasoning := array_append(v_reasoning, 'Capacità satura: selectivity +8%');
  END IF;

  -- Materiali rilevanti (variazione vs 90gg fa)
  WITH material_changes AS (
    SELECT
      m.material_key,
      m.price_eur_kg AS current_price,
      (
        SELECT mp.price_eur_kg FROM public.material_price_index mp
        WHERE mp.material_key = m.material_key
          AND mp.index_date <= (current_date - 90)
        ORDER BY mp.index_date DESC LIMIT 1
      ) AS price_90d_ago
    FROM public.material_price_index m
    WHERE m.index_date >= (current_date - 7)
      AND (p_material_keys IS NULL OR m.material_key = ANY(p_material_keys))
    ORDER BY m.material_key, m.index_date DESC
  )
  SELECT jsonb_agg(jsonb_build_object(
    'material', material_key,
    'current_eur_kg', current_price,
    'price_90d_ago', price_90d_ago,
    'change_pct', CASE
      WHEN price_90d_ago > 0 THEN round(((current_price - price_90d_ago) / price_90d_ago) * 100, 1)
      ELSE NULL END
  )) INTO v_materials
  FROM material_changes;

  -- Aggiunge effetto materiali al pct
  IF v_materials IS NOT NULL THEN
    -- semplificazione: se almeno 1 materiale +10% in 90gg → suggerisci +3%
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_materials) e
      WHERE (e->>'change_pct')::numeric > 10
    ) THEN
      v_suggested_pct := v_suggested_pct + 3;
      v_reasoning := array_append(v_reasoning, 'Materiali: aumento >10% in 90gg, +3%');
    END IF;
  END IF;

  -- Competitor signals attivi (non scaduti)
  SELECT jsonb_agg(jsonb_build_object(
    'competitor', competitor_name,
    'category', product_category,
    'signal_type', signal_type,
    'signal_value', signal_value,
    'description', signal_description,
    'observed_at', observed_at
  )) INTO v_competitors
  FROM public.competitor_pricing_signals
  WHERE company_id = p_company_id
    AND (p_product_category IS NULL OR product_category = p_product_category)
    AND (expires_at IS NULL OR expires_at >= current_date)
    AND observed_at >= (current_date - 90);

  -- Effetto competitor
  IF v_competitors IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_competitors) e
      WHERE e->>'signal_type' = 'price_increase'
    ) THEN
      v_suggested_pct := v_suggested_pct + 2;
      v_reasoning := array_append(v_reasoning, 'Concorrente ha alzato: +2% margine espandibile');
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_competitors) e
      WHERE e->>'signal_type' = 'price_decrease'
    ) THEN
      v_suggested_pct := v_suggested_pct - 2;
      v_reasoning := array_append(v_reasoning, 'Concorrente ha abbassato: -2% per protezione close rate');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'demand_index', v_demand.demand_index,
    'season_factor', v_demand.season_factor,
    'season_label', v_demand.season_label,
    'capacity_utilization_pct', v_demand.capacity_utilization_pct,
    'materials', COALESCE(v_materials, '[]'::jsonb),
    'competitors', COALESCE(v_competitors, '[]'::jsonb),
    'suggested_adjustment_pct', v_suggested_pct,
    'reasoning', to_jsonb(v_reasoning)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_get_dynamic_pricing_factors(uuid, text, text[]) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: silvio_tool_record_competitor_signal — alimentato da utenti/AI
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_record_competitor_signal(
  p_company_id uuid,
  p_competitor_name text,
  p_product_category text,
  p_signal_type text,
  p_signal_value numeric DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_zone text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.competitor_pricing_signals(
    company_id, competitor_name, product_category, zone,
    signal_type, signal_value, signal_description, source, created_by,
    expires_at
  )
  VALUES (
    p_company_id, p_competitor_name, p_product_category, p_zone,
    p_signal_type, p_signal_value, p_description, p_source, auth.uid(),
    current_date + interval '90 days'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'signal_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_record_competitor_signal(uuid, text, text, text, numeric, text, text, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Dynamic pricing real-time tables + RPC ready'; END $$;
