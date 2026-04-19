-- ============================================================================
-- RENDER ECONOMICS (Supermaster — Parte B: B1 + B3 + B4)
--
-- Obiettivo: per ogni render registrare il COSTO REALE API sostenuto
-- e il RICAVO REALE (prezzo effettivamente pagato dall'azienda per il credito
-- consumato, calcolato FIFO sui purchase). Aggregazione SuperAdmin.
--
-- Idempotente: tutte le creazioni usano IF NOT EXISTS / OR REPLACE. Può essere
-- rieseguita senza effetti collaterali.
-- ============================================================================

-- ── B1.1 render_credit_packs (SKU pacchetti acquistabili) ───────────────────
CREATE TABLE IF NOT EXISTS public.render_credit_packs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  label text NOT NULL,
  credits_amount integer NOT NULL CHECK (credits_amount > 0),
  price_eur numeric(10,2) NOT NULL CHECK (price_eur >= 0),
  price_per_credit_eur numeric(10,4)
    GENERATED ALWAYS AS (
      CASE WHEN credits_amount > 0 THEN price_eur / credits_amount ELSE 0 END
    ) STORED,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed iniziale (non tocca righe esistenti)
INSERT INTO public.render_credit_packs (sku, label, credits_amount, price_eur, sort_order)
VALUES
  ('pack_starter_50',     'Starter 50 render',     50,   4.90, 1),
  ('pack_pro_200',        'Pro 200 render',        200, 17.90, 2),
  ('pack_business_500',   'Business 500 render',   500, 39.90, 3),
  ('pack_enterprise_2000','Enterprise 2000 render',2000,139.00, 4)
ON CONFLICT (sku) DO NOTHING;

ALTER TABLE public.render_credit_packs ENABLE ROW LEVEL SECURITY;

-- SELECT pubblica (landing prezzi) / scrittura solo super_admin
DROP POLICY IF EXISTS "all_read_packs" ON public.render_credit_packs;
CREATE POLICY "all_read_packs" ON public.render_credit_packs
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "sa_write_packs" ON public.render_credit_packs;
CREATE POLICY "sa_write_packs" ON public.render_credit_packs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── B1.2 render_credit_purchases (storico acquisti con prezzo reale) ────────
CREATE TABLE IF NOT EXISTS public.render_credit_purchases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pack_id uuid REFERENCES public.render_credit_packs(id),
  credits_amount integer NOT NULL CHECK (credits_amount > 0),
  -- Crediti ancora disponibili di questo acquisto (per FIFO decremento)
  credits_remaining integer NOT NULL CHECK (credits_remaining >= 0),
  price_paid_eur numeric(10,2) NOT NULL CHECK (price_paid_eur >= 0),
  price_per_credit_eur numeric(10,4) NOT NULL CHECK (price_per_credit_eur >= 0),
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','completed','refunded','failed')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcp_company ON public.render_credit_purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_rcp_purchased_at ON public.render_credit_purchases(purchased_at DESC);
-- Indice per FIFO: velocizza la ricerca del purchase più vecchio con crediti residui
CREATE INDEX IF NOT EXISTS idx_rcp_fifo ON public.render_credit_purchases(company_id, purchased_at ASC)
  WHERE status = 'completed' AND credits_remaining > 0;

ALTER TABLE public.render_credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_read_own_purchases" ON public.render_credit_purchases;
CREATE POLICY "co_read_own_purchases" ON public.render_credit_purchases
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "sa_all_purchases" ON public.render_credit_purchases;
CREATE POLICY "sa_all_purchases" ON public.render_credit_purchases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── B1.3 render_provider_pricing (listino provider versionato) ──────────────
CREATE TABLE IF NOT EXISTS public.render_provider_pricing (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key text NOT NULL,
  model text NOT NULL,
  pricing_mode text NOT NULL CHECK (pricing_mode IN ('per_image','per_token','hybrid')),
  price_input_image_eur numeric(10,8) NOT NULL DEFAULT 0,
  price_input_token_eur numeric(12,10) NOT NULL DEFAULT 0,
  price_output_image_eur numeric(10,8) NOT NULL DEFAULT 0,
  price_output_token_eur numeric(12,10) NOT NULL DEFAULT 0,
  -- Fallback deterministico quando l'API non ritorna usage (per_image mode):
  fallback_cost_per_call_eur numeric(10,6) NOT NULL DEFAULT 0,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_key, model, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rpp_lookup
  ON public.render_provider_pricing(provider_key, model)
  WHERE effective_to IS NULL;

-- Seed iniziale pricing (stima conservativa; aggiornare con fatture reali)
INSERT INTO public.render_provider_pricing
  (provider_key, model, pricing_mode,
   price_output_image_eur, price_output_token_eur, fallback_cost_per_call_eur, notes)
VALUES
  ('openai', 'gpt-image-1', 'hybrid',
   0.0367, 0.00000000, 0.0367,
   'Stima 1536x1024 HQ; aggiornare con pricing ufficiale OpenAI'),
  ('gemini', 'gemini-2.5-flash-image', 'per_image',
   0.0367, 0.0000000030, 0.0367,
   '~$0.039 output image (1024 lato lungo ≈ 1290 token). Verificare in tempo reale.')
ON CONFLICT (provider_key, model, effective_from) DO NOTHING;

ALTER TABLE public.render_provider_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_provider_pricing" ON public.render_provider_pricing;
CREATE POLICY "sa_provider_pricing" ON public.render_provider_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- La edge function leggere il pricing come super_admin via SERVICE_ROLE_KEY
-- (oppure gli authenticated hanno SELECT solo su active pricing del proprio consumo)

-- ── B1.4 render_sessions — aggiunta colonne economics + meta ────────────────
ALTER TABLE public.render_sessions
  ADD COLUMN IF NOT EXISTS cost_real_api numeric(10,6),
  ADD COLUMN IF NOT EXISTS cost_real_storage numeric(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_eur numeric(10,4),
  ADD COLUMN IF NOT EXISTS provider_usage jsonb,
  ADD COLUMN IF NOT EXISTS provider_model text,
  ADD COLUMN IF NOT EXISTS provider_request_id text,
  ADD COLUMN IF NOT EXISTS vertical text,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- `cost_real_total` generata (API + storage). Già esiste `cost_real` legacy
-- — NON lo tocchiamo per retrocompat, ma calcoliamo in aggregazione
-- preferendo cost_real_api se valorizzato.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='render_sessions' AND column_name='cost_real_total'
  ) THEN
    ALTER TABLE public.render_sessions
      ADD COLUMN cost_real_total numeric(10,6)
        GENERATED ALWAYS AS (
          COALESCE(cost_real_api, 0) + COALESCE(cost_real_storage, 0)
        ) STORED;
  END IF;
END $$;

-- `margin_eur` generata
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='render_sessions' AND column_name='margin_eur'
  ) THEN
    ALTER TABLE public.render_sessions
      ADD COLUMN margin_eur numeric(10,4)
        GENERATED ALWAYS AS (
          COALESCE(revenue_eur, 0)
          - COALESCE(cost_real_api, 0)
          - COALESCE(cost_real_storage, 0)
        ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rs_economics
  ON public.render_sessions(company_id, created_at DESC, status);

-- ============================================================================
-- B3 — deduct_render_credit_v2 con FIFO revenue tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deduct_render_credit_v2(_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _balance integer;
  _price numeric := 0;
  _purchase_id uuid;
BEGIN
  -- Lock balance riga per evitare race on concurrent deducts
  SELECT balance INTO _balance
  FROM public.render_credits
  WHERE company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND OR _balance <= 0 THEN
    RETURN json_build_object('status', 'insufficient', 'revenue_eur', 0);
  END IF;

  -- FIFO: trova il purchase più vecchio con crediti residui
  SELECT id, price_per_credit_eur
  INTO _purchase_id, _price
  FROM public.render_credit_purchases
  WHERE company_id = _company_id
    AND status = 'completed'
    AND credits_remaining > 0
  ORDER BY purchased_at ASC
  LIMIT 1
  FOR UPDATE;

  -- Se nessun purchase con crediti residui (es. crediti omaggio / setup_free),
  -- il revenue è 0 e il margine sarà negativo: è comportamento corretto.
  IF _purchase_id IS NULL THEN
    _price := 0;
  ELSE
    UPDATE public.render_credit_purchases
    SET credits_remaining = credits_remaining - 1
    WHERE id = _purchase_id;
  END IF;

  -- Deduci dal balance generale
  UPDATE public.render_credits
  SET
    balance = balance - 1,
    total_used = total_used + 1,
    updated_at = now()
  WHERE company_id = _company_id;

  RETURN json_build_object(
    'status', 'ok',
    'revenue_eur', _price,
    'purchase_id', _purchase_id
  );
END;
$$;

COMMENT ON FUNCTION public.deduct_render_credit_v2(uuid) IS
'Deduct 1 render credit + return FIFO price_per_credit_eur as revenue.
Return: {status: ok|insufficient, revenue_eur: numeric, purchase_id: uuid|null}.
Backwards compatible con deduct_render_credit originale (che continua a esistere).';

-- ============================================================================
-- B4 — RPC aggregazione SuperAdmin (3 funzioni)
-- ============================================================================

-- ── B4.1 get_render_economics_by_company ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_render_economics_by_company(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  renders_count bigint,
  cost_total_eur numeric,
  revenue_total_eur numeric,
  margin_total_eur numeric,
  margin_pct numeric,
  avg_cost_per_render numeric,
  avg_revenue_per_render numeric,
  last_activity timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    COUNT(rs.id)::bigint AS renders_count,
    COALESCE(SUM(rs.cost_real_total), 0)::numeric AS cost_total_eur,
    COALESCE(SUM(rs.revenue_eur), 0)::numeric AS revenue_total_eur,
    COALESCE(SUM(rs.margin_eur), 0)::numeric AS margin_total_eur,
    CASE
      WHEN COALESCE(SUM(rs.revenue_eur), 0) > 0
      THEN ROUND((COALESCE(SUM(rs.margin_eur), 0) / SUM(rs.revenue_eur)) * 100, 2)
      ELSE 0
    END AS margin_pct,
    CASE WHEN COUNT(rs.id) > 0
      THEN ROUND(COALESCE(SUM(rs.cost_real_total), 0) / COUNT(rs.id), 6)
      ELSE 0
    END AS avg_cost_per_render,
    CASE WHEN COUNT(rs.id) > 0
      THEN ROUND(COALESCE(SUM(rs.revenue_eur), 0) / COUNT(rs.id), 4)
      ELSE 0
    END AS avg_revenue_per_render,
    MAX(rs.created_at) AS last_activity
  FROM public.companies c
  LEFT JOIN public.render_sessions rs
    ON rs.company_id = c.id
   AND rs.status = 'completed'
   AND rs.created_at >= _from
   AND rs.created_at <= _to
  GROUP BY c.id, c.name
  HAVING COUNT(rs.id) > 0
  ORDER BY margin_total_eur ASC, renders_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_render_economics_by_company(timestamptz, timestamptz) IS
'Aggregated render economics per company within [_from, _to]. Super-admin only.
Sort: margin ascending (worst first) so admin può reagire subito.';

-- ── B4.2 get_render_economics_detail ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_render_economics_detail(
  _company_id uuid,
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS TABLE (
  session_id uuid,
  created_at timestamptz,
  provider text,
  model text,
  vertical text,
  cost_real_api numeric,
  revenue_eur numeric,
  margin_eur numeric,
  status text,
  prompt_version text,
  result_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    rs.id AS session_id,
    rs.created_at,
    rs.provider_key AS provider,
    rs.provider_model AS model,
    rs.vertical,
    rs.cost_real_api,
    rs.revenue_eur,
    rs.margin_eur,
    rs.status,
    rs.prompt_version,
    (CASE WHEN array_length(rs.result_urls, 1) > 0 THEN rs.result_urls[1] ELSE NULL END) AS result_url
  FROM public.render_sessions rs
  WHERE rs.company_id = _company_id
    AND rs.created_at >= _from
    AND rs.created_at <= _to
  ORDER BY rs.created_at DESC
  LIMIT 500;
END;
$$;

COMMENT ON FUNCTION public.get_render_economics_detail(uuid, timestamptz, timestamptz) IS
'Detail sessions per company within period, ordered desc, capped at 500. Super-admin only.';

-- ── B4.3 get_render_economics_global ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_render_economics_global(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result json;
  _totals json;
  _top_vol json;
  _top_margin json;
  _bot_margin json;
  _neg_count integer;
  _provider_breakdown json;
  _daily json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required' USING ERRCODE = '42501';
  END IF;

  -- Totali globali
  SELECT json_build_object(
    'total_renders', COUNT(*),
    'total_cost', COALESCE(SUM(cost_real_total), 0),
    'total_revenue', COALESCE(SUM(revenue_eur), 0),
    'total_margin', COALESCE(SUM(margin_eur), 0),
    'margin_pct', CASE
      WHEN COALESCE(SUM(revenue_eur), 0) > 0
      THEN ROUND((COALESCE(SUM(margin_eur), 0) / SUM(revenue_eur)) * 100, 2)
      ELSE 0
    END
  ) INTO _totals
  FROM public.render_sessions
  WHERE status = 'completed'
    AND created_at >= _from AND created_at <= _to;

  -- Top 5 per volume
  SELECT json_agg(x ORDER BY x.renders_count DESC) INTO _top_vol
  FROM (
    SELECT c.id AS company_id, c.name AS company_name,
           COUNT(rs.id) AS renders_count,
           COALESCE(SUM(rs.margin_eur), 0) AS margin_eur
    FROM public.render_sessions rs
    JOIN public.companies c ON c.id = rs.company_id
    WHERE rs.status = 'completed'
      AND rs.created_at >= _from AND rs.created_at <= _to
    GROUP BY c.id, c.name
    ORDER BY COUNT(rs.id) DESC
    LIMIT 5
  ) x;

  -- Top 5 per margine
  SELECT json_agg(x ORDER BY x.margin_eur DESC) INTO _top_margin
  FROM (
    SELECT c.id AS company_id, c.name AS company_name,
           COALESCE(SUM(rs.margin_eur), 0) AS margin_eur,
           COUNT(rs.id) AS renders_count
    FROM public.render_sessions rs
    JOIN public.companies c ON c.id = rs.company_id
    WHERE rs.status = 'completed'
      AND rs.created_at >= _from AND rs.created_at <= _to
    GROUP BY c.id, c.name
    ORDER BY COALESCE(SUM(rs.margin_eur), 0) DESC
    LIMIT 5
  ) x;

  -- Bottom 5 per margine (solo negativi — peggiori)
  SELECT json_agg(x ORDER BY x.margin_eur ASC) INTO _bot_margin
  FROM (
    SELECT c.id AS company_id, c.name AS company_name,
           COALESCE(SUM(rs.margin_eur), 0) AS margin_eur,
           COUNT(rs.id) AS renders_count
    FROM public.render_sessions rs
    JOIN public.companies c ON c.id = rs.company_id
    WHERE rs.status = 'completed'
      AND rs.created_at >= _from AND rs.created_at <= _to
    GROUP BY c.id, c.name
    HAVING COALESCE(SUM(rs.margin_eur), 0) < 0
    ORDER BY COALESCE(SUM(rs.margin_eur), 0) ASC
    LIMIT 5
  ) x;

  -- Count aziende con margine negativo
  SELECT COUNT(*) INTO _neg_count
  FROM (
    SELECT company_id
    FROM public.render_sessions
    WHERE status = 'completed'
      AND created_at >= _from AND created_at <= _to
    GROUP BY company_id
    HAVING COALESCE(SUM(margin_eur), 0) < 0
  ) x;

  -- Provider breakdown
  SELECT json_agg(x) INTO _provider_breakdown
  FROM (
    SELECT
      provider_key AS provider,
      COUNT(*) AS renders_count,
      COALESCE(SUM(cost_real_total), 0) AS cost_total,
      COALESCE(SUM(revenue_eur), 0) AS revenue_total,
      COALESCE(SUM(margin_eur), 0) AS margin_total
    FROM public.render_sessions
    WHERE status = 'completed'
      AND created_at >= _from AND created_at <= _to
      AND provider_key IS NOT NULL
    GROUP BY provider_key
  ) x;

  -- Serie giornaliera cost vs revenue
  SELECT json_agg(x ORDER BY x.day) INTO _daily
  FROM (
    SELECT
      DATE(created_at) AS day,
      COUNT(*) AS renders_count,
      COALESCE(SUM(cost_real_total), 0) AS cost,
      COALESCE(SUM(revenue_eur), 0) AS revenue,
      COALESCE(SUM(margin_eur), 0) AS margin
    FROM public.render_sessions
    WHERE status = 'completed'
      AND created_at >= _from AND created_at <= _to
    GROUP BY DATE(created_at)
  ) x;

  SELECT json_build_object(
    'totals', _totals,
    'top_5_by_volume', COALESCE(_top_vol, '[]'::json),
    'top_5_by_margin', COALESCE(_top_margin, '[]'::json),
    'bottom_5_by_margin', COALESCE(_bot_margin, '[]'::json),
    'companies_with_negative_margin_count', _neg_count,
    'provider_breakdown', COALESCE(_provider_breakdown, '[]'::json),
    'daily', COALESCE(_daily, '[]'::json),
    'period', json_build_object('from', _from, 'to', _to)
  ) INTO _result;

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION public.get_render_economics_global(timestamptz, timestamptz) IS
'Global render economics dashboard bundle. Super-admin only.
Single-RPC payload ottimizzato per AdminRenderEconomics UI.';

-- ============================================================================
-- Grant execution su authenticated (RLS + role check interno)
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.deduct_render_credit_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_render_economics_by_company(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_render_economics_detail(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_render_economics_global(timestamptz, timestamptz) TO authenticated;

-- ============================================================================
-- Notify PostgREST schema reload
-- ============================================================================
NOTIFY pgrst, 'reload schema';
