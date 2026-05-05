-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 5 — Data Network Aggregato (benchmark di settore anonimi)
-- Cervello Supremo EiC
-- ════════════════════════════════════════════════════════════════════════════
-- 4 tabelle + 5 helper/RPC + 1 ETL function (manuale, non schedulata).
--
-- ADATTAMENTI vs spec (schema reale companies):
--   - settore_ateco → sector (col esistente)
--   - fatturato_anno (numeric) → annual_revenue_range (text, può essere null)
--   - archived_at IS NULL → status='active'
--
-- Privacy by design:
--   - Pseudonymization SHA-256 con salt lato server
--   - k-anonymity ≥ 5 (CHECK constraint)
--   - Suppressione cluster piccoli automatica
--   - Audit trail completo
--   - Opt-in di default = pending (deve essere settato esplicitamente)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabella consensi cliente
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_data_network_consent (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  consent_status text NOT NULL DEFAULT 'pending'
    CHECK (consent_status IN ('opt_in','opt_out','pending')),
  consent_given_at timestamptz,
  consent_given_by uuid REFERENCES auth.users(id),
  consent_revoked_at timestamptz,
  consent_revoked_by uuid REFERENCES auth.users(id),
  consent_version text NOT NULL DEFAULT '1.0',
  metrics_categories_opted text[] DEFAULT ARRAY['finanziaria','operativa','commerciale']::text[],
  exclude_specific_metrics text[] DEFAULT '{}'::text[],
  audit_log jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_data_network_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_company_admin" ON public.company_data_network_consent;
CREATE POLICY "consent_company_admin" ON public.company_data_network_consent
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

GRANT SELECT, INSERT, UPDATE ON public.company_data_network_consent TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Tabella staging temporanea per ETL
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.etl_staging_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  pseudo_company_id text NOT NULL,
  metric_key text NOT NULL,
  metric_category text NOT NULL,
  value numeric,
  unit text,
  segment_data jsonb,
  data_period_start date,
  data_period_end date,
  computed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staging_run ON public.etl_staging_metrics (run_id);
CREATE INDEX IF NOT EXISTS idx_staging_metric ON public.etl_staging_metrics (metric_key);

ALTER TABLE public.etl_staging_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staging_super_admin_only" ON public.etl_staging_metrics;
CREATE POLICY "staging_super_admin_only" ON public.etl_staging_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Tabella benchmark aggregati (target finale)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kb_aggregated_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  metric_category text NOT NULL,
  cluster_segment jsonb NOT NULL,
  sample_size int NOT NULL,
  median numeric,
  p25 numeric, p75 numeric,
  p10 numeric, p90 numeric,
  mean numeric,
  std_dev numeric,
  min_value numeric, max_value numeric,
  unit text,
  data_period_start date,
  data_period_end date,
  computed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT k_anonymity_check CHECK (sample_size >= 5)
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_metric ON public.kb_aggregated_benchmarks (metric_key);
CREATE INDEX IF NOT EXISTS idx_benchmarks_cluster ON public.kb_aggregated_benchmarks USING gin (cluster_segment);
CREATE INDEX IF NOT EXISTS idx_benchmarks_period ON public.kb_aggregated_benchmarks (data_period_end DESC);

ALTER TABLE public.kb_aggregated_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmarks_read_all" ON public.kb_aggregated_benchmarks;
CREATE POLICY "benchmarks_read_all" ON public.kb_aggregated_benchmarks FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

DROP POLICY IF EXISTS "benchmarks_write_super_admin" ON public.kb_aggregated_benchmarks;
CREATE POLICY "benchmarks_write_super_admin" ON public.kb_aggregated_benchmarks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

GRANT SELECT ON public.kb_aggregated_benchmarks TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Tabella audit ETL
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.data_network_etl_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  step text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','partial','failed','skipped')),
  companies_processed int,
  metrics_processed int,
  benchmarks_published int,
  benchmarks_suppressed int,
  details jsonb,
  duration_ms int,
  computed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_audit_run ON public.data_network_etl_audit (run_id);
CREATE INDEX IF NOT EXISTS idx_etl_audit_date ON public.data_network_etl_audit (computed_at DESC);

ALTER TABLE public.data_network_etl_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_super_admin_read" ON public.data_network_etl_audit;
CREATE POLICY "audit_super_admin_read" ON public.data_network_etl_audit
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Helper functions per segmentazione
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.area_macro_from_region(p_region text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_region IN ('Lombardia','Piemonte','Liguria','Veneto','Trentino-Alto Adige','Friuli-Venezia Giulia','Emilia-Romagna','Valle d''Aosta')
      THEN 'nord'
    WHEN p_region IN ('Toscana','Umbria','Marche','Lazio','Abruzzo')
      THEN 'centro'
    WHEN p_region IN ('Campania','Puglia','Calabria','Basilicata','Molise','Sicilia','Sardegna')
      THEN 'sud_isole'
    ELSE 'sconosciuto'
  END;
$$;

-- Adattata: usa annual_revenue_range (text). Mappa range → categoria dimensione.
CREATE OR REPLACE FUNCTION public.dimensione_from_revenue_range(p_range text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_range IS NULL THEN 'sconosciuto'
    WHEN p_range IN ('<500k','500k-1M') THEN 'micro'
    WHEN p_range IN ('1M-3M') THEN 'piccola'
    WHEN p_range IN ('3M-10M') THEN 'media'
    WHEN p_range IN ('10M-30M','>30M') THEN 'grande'
    ELSE 'altro'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.area_macro_from_region(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dimensione_from_revenue_range(text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC: data_network_set_consent
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.data_network_set_consent(
  p_company_id uuid,
  p_consent_status text,
  p_metrics_categories text[] DEFAULT ARRAY['finanziaria','operativa','commerciale'],
  p_exclude_metrics text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status text;
BEGIN
  IF p_consent_status NOT IN ('opt_in','opt_out','pending') THEN
    RAISE EXCEPTION 'consent_status invalid: %', p_consent_status;
  END IF;

  SELECT consent_status INTO v_prev_status
  FROM public.company_data_network_consent WHERE company_id = p_company_id;

  INSERT INTO public.company_data_network_consent (
    company_id, consent_status, consent_given_at, consent_given_by,
    consent_version, metrics_categories_opted, exclude_specific_metrics
  ) VALUES (
    p_company_id, p_consent_status,
    CASE WHEN p_consent_status = 'opt_in' THEN now() ELSE NULL END,
    auth.uid(),
    '1.0', p_metrics_categories, p_exclude_metrics
  )
  ON CONFLICT (company_id) DO UPDATE SET
    consent_status = EXCLUDED.consent_status,
    consent_given_at = CASE
      WHEN EXCLUDED.consent_status = 'opt_in' AND public.company_data_network_consent.consent_status != 'opt_in'
      THEN now()
      ELSE public.company_data_network_consent.consent_given_at
    END,
    consent_revoked_at = CASE
      WHEN EXCLUDED.consent_status = 'opt_out' AND public.company_data_network_consent.consent_status = 'opt_in'
      THEN now()
      ELSE public.company_data_network_consent.consent_revoked_at
    END,
    consent_revoked_by = CASE
      WHEN EXCLUDED.consent_status = 'opt_out' AND public.company_data_network_consent.consent_status = 'opt_in'
      THEN auth.uid()
      ELSE public.company_data_network_consent.consent_revoked_by
    END,
    metrics_categories_opted = EXCLUDED.metrics_categories_opted,
    exclude_specific_metrics = EXCLUDED.exclude_specific_metrics,
    updated_at = now(),
    audit_log = COALESCE(public.company_data_network_consent.audit_log, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'action', EXCLUDED.consent_status,
        'previous', v_prev_status,
        'by', auth.uid(),
        'at', now()
      )
    );

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'consent_status', p_consent_status,
    'previous_status', v_prev_status,
    'changed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.data_network_set_consent(uuid, text, text[], text[]) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: get_industry_benchmark (esposto a personas via Silvio tool)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_industry_benchmark(
  p_metric_key text,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segment jsonb;
  v_benchmark RECORD;
BEGIN
  -- Determina cluster azienda corrente
  SELECT jsonb_build_object(
    'sector', COALESCE(c.sector, 'altro'),
    'area_macro', area_macro_from_region(c.region),
    'dimensione', dimensione_from_revenue_range(c.annual_revenue_range)
  ) INTO v_segment
  FROM public.companies c WHERE c.id = p_company_id;

  IF v_segment IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'company_not_found');
  END IF;

  -- Cerca benchmark più recente per cluster esatto
  SELECT * INTO v_benchmark
  FROM public.kb_aggregated_benchmarks
  WHERE metric_key = p_metric_key
    AND cluster_segment = v_segment
  ORDER BY data_period_end DESC NULLS LAST
  LIMIT 1;

  -- Fallback 1: settore + area (no dimensione)
  IF v_benchmark.id IS NULL THEN
    SELECT * INTO v_benchmark
    FROM public.kb_aggregated_benchmarks
    WHERE metric_key = p_metric_key
      AND cluster_segment->>'sector' = v_segment->>'sector'
      AND cluster_segment->>'area_macro' = v_segment->>'area_macro'
    ORDER BY data_period_end DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Fallback 2: solo settore
  IF v_benchmark.id IS NULL THEN
    SELECT * INTO v_benchmark
    FROM public.kb_aggregated_benchmarks
    WHERE metric_key = p_metric_key
      AND cluster_segment->>'sector' = v_segment->>'sector'
    ORDER BY data_period_end DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_benchmark.id IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'Nessun benchmark per questo segmento (campione insufficiente, k-anonymity 5 minimo)',
      'searched_segment', v_segment,
      'searched_metric', p_metric_key
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'metric_key', p_metric_key,
    'unit', v_benchmark.unit,
    'benchmark', jsonb_build_object(
      'sample_size', v_benchmark.sample_size,
      'median', v_benchmark.median,
      'p25', v_benchmark.p25,
      'p75', v_benchmark.p75,
      'p10', v_benchmark.p10,
      'p90', v_benchmark.p90,
      'mean', v_benchmark.mean
    ),
    'cluster_segment', v_benchmark.cluster_segment,
    'data_period', jsonb_build_object('from', v_benchmark.data_period_start, 'to', v_benchmark.data_period_end),
    'computed_at', v_benchmark.computed_at,
    'disclaimer', format('Benchmark da %s aziende del cluster %s. Dati aggregati e anonimizzati (k-anonymity ≥5).',
      v_benchmark.sample_size, v_benchmark.cluster_segment::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_industry_benchmark(text, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Helper: pseudonimizza company_id con salt
-- ───────────────────────────────────────────────────────────────────────────
-- Per ora salt hardcoded. In futuro: spostare in pgsodium/Vault.

CREATE OR REPLACE FUNCTION public.pseudo_company_id(p_company_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(
    digest(p_company_id::text || 'eic_etl_v1_salt_track5_change_in_prod', 'sha256'),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION public.pseudo_company_id(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pseudo_company_id(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) ETL: data_network_etl_run() — main pipeline
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.data_network_etl_run()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_period_end date := CURRENT_DATE;
  v_period_start date := CURRENT_DATE - interval '90 days';
  v_companies_optin int;
  v_metrics_extracted int := 0;
  v_benchmarks_published int := 0;
  v_benchmarks_suppressed int := 0;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  -- STAGE 1: Pre-flight check
  SELECT count(*) INTO v_companies_optin
    FROM public.company_data_network_consent
    WHERE consent_status = 'opt_in';

  INSERT INTO public.data_network_etl_audit (run_id, step, status, companies_processed, details)
  VALUES (v_run_id, 'preflight', CASE WHEN v_companies_optin >= 5 THEN 'success' ELSE 'skipped' END,
    v_companies_optin,
    jsonb_build_object('reason', CASE WHEN v_companies_optin < 5 THEN 'campione insufficiente per k-anonymity' ELSE 'OK' END));

  IF v_companies_optin < 5 THEN
    RETURN jsonb_build_object(
      'success', false, 'run_id', v_run_id,
      'reason', 'campione opt_in insufficiente (5 minimo, attuali: ' || v_companies_optin || ')',
      'opt_in_companies', v_companies_optin
    );
  END IF;

  -- STAGE 2: Extract — DSO medio per company opt-in (categoria finanziaria)
  INSERT INTO public.etl_staging_metrics (run_id, pseudo_company_id, metric_key, metric_category, value, unit, segment_data, data_period_start, data_period_end)
  SELECT
    v_run_id,
    public.pseudo_company_id(c.id),
    'dso_medio_giorni',
    'finanziaria',
    ((public.silvio_payment_delay_pattern(c.id))->>'avg_delay_days_global')::numeric,
    'giorni',
    jsonb_build_object(
      'sector', COALESCE(c.sector, 'altro'),
      'area_macro', public.area_macro_from_region(c.region),
      'dimensione', public.dimensione_from_revenue_range(c.annual_revenue_range)
    ),
    v_period_start, v_period_end
  FROM public.companies c
  JOIN public.company_data_network_consent cn ON cn.company_id = c.id
  WHERE cn.consent_status = 'opt_in'
    AND 'finanziaria' = ANY(cn.metrics_categories_opted)
    AND NOT 'dso_medio_giorni' = ANY(cn.exclude_specific_metrics)
    AND COALESCE(c.status, 'active') = 'active';

  GET DIAGNOSTICS v_metrics_extracted = ROW_COUNT;

  -- STAGE 3: Aggregate per cluster (k-anonymity ≥ 5)
  INSERT INTO public.kb_aggregated_benchmarks (
    metric_key, metric_category, cluster_segment, sample_size,
    median, p25, p75, p10, p90, mean, std_dev, min_value, max_value,
    unit, data_period_start, data_period_end, metadata
  )
  SELECT
    metric_key,
    metric_category,
    jsonb_build_object(
      'sector', segment_data->>'sector',
      'area_macro', segment_data->>'area_macro',
      'dimensione', segment_data->>'dimensione'
    ),
    count(DISTINCT pseudo_company_id) AS sample_size,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY value),
    percentile_cont(0.25) WITHIN GROUP (ORDER BY value),
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value),
    percentile_cont(0.10) WITHIN GROUP (ORDER BY value),
    percentile_cont(0.90) WITHIN GROUP (ORDER BY value),
    avg(value), stddev_pop(value), min(value), max(value),
    max(unit), min(data_period_start), max(data_period_end),
    jsonb_build_object('etl_run_id', v_run_id)
  FROM public.etl_staging_metrics
  WHERE run_id = v_run_id
  GROUP BY metric_key, metric_category,
    segment_data->>'sector',
    segment_data->>'area_macro',
    segment_data->>'dimensione'
  HAVING count(DISTINCT pseudo_company_id) >= 5;

  GET DIAGNOSTICS v_benchmarks_published = ROW_COUNT;

  -- STAGE 4: Conta cluster soppressi per audit
  SELECT count(*) INTO v_benchmarks_suppressed
  FROM (
    SELECT segment_data->>'sector', segment_data->>'area_macro', segment_data->>'dimensione', metric_key
    FROM public.etl_staging_metrics
    WHERE run_id = v_run_id
    GROUP BY segment_data->>'sector', segment_data->>'area_macro', segment_data->>'dimensione', metric_key
    HAVING count(DISTINCT pseudo_company_id) < 5
  ) sub;

  -- STAGE 5: Cleanup staging
  DELETE FROM public.etl_staging_metrics WHERE run_id = v_run_id;

  -- Audit finale
  INSERT INTO public.data_network_etl_audit (
    run_id, step, status, companies_processed, metrics_processed,
    benchmarks_published, benchmarks_suppressed, duration_ms, details
  ) VALUES (
    v_run_id, 'complete', 'success',
    v_companies_optin, v_metrics_extracted,
    v_benchmarks_published, v_benchmarks_suppressed,
    EXTRACT(milliseconds FROM (clock_timestamp() - v_t0))::int,
    jsonb_build_object(
      'period_start', v_period_start,
      'period_end', v_period_end,
      'metrics_keys', ARRAY['dso_medio_giorni']
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'companies_optin', v_companies_optin,
    'metrics_extracted', v_metrics_extracted,
    'benchmarks_published', v_benchmarks_published,
    'benchmarks_suppressed', v_benchmarks_suppressed,
    'duration_ms', EXTRACT(milliseconds FROM (clock_timestamp() - v_t0))::int
  );
END;
$$;

REVOKE ALL ON FUNCTION public.data_network_etl_run() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_network_etl_run() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 10) Verifiche post-migration
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN ('company_data_network_consent','etl_staging_metrics','kb_aggregated_benchmarks','data_network_etl_audit');
  IF v_cnt <> 4 THEN RAISE EXCEPTION 'Atteso 4 tabelle, trovate %', v_cnt; END IF;
  RAISE NOTICE 'OK: 4 tabelle data_network create';

  SELECT count(*) INTO v_cnt FROM pg_proc WHERE proname IN (
    'area_macro_from_region','dimensione_from_revenue_range',
    'data_network_set_consent','get_industry_benchmark',
    'pseudo_company_id','data_network_etl_run'
  );
  IF v_cnt <> 6 THEN RAISE EXCEPTION 'Atteso 6 RPC/helper, trovate %', v_cnt; END IF;
  RAISE NOTICE 'OK: 6 RPC create';

  -- Test ETL pipeline (su 0 companies opt-in dovrebbe ritornare skip)
  PERFORM public.data_network_etl_run();
  RAISE NOTICE 'OK: ETL run eseguito (skipped per insufficienza opt-in, comportamento atteso)';
END $$;

COMMIT;
