-- MP-AEDIX-01 — Brain AEDIX cross-tenant data lake
--
-- Brain di livello superiore che aggrega dati ANONIMIZZATI da TUTTI i tenant
-- per benchmarking, statistiche di mercato, predittive churn/trend.
--
-- VINCOLI NON NEGOZIABILI (privacy-by-design):
--   1. Pseudonimizzazione: zero PII. Solo aggregati e categorie.
--   2. K-anonymity ≥ 5: nessuna query restituisce dati di < 5 companies.
--   3. Opt-in esplicito: companies.aedix_brain_opt_in (default true ma opt-out in UI).
--   4. Data residency UE: snapshot store solo EU.
--   5. Auto-delete: snapshot più vecchi di 36 mesi auto-eliminati.
--
-- Pipeline aggregazione: edge function `aedix-brain-snapshot` cron daily 02:00.

CREATE SCHEMA IF NOT EXISTS aedix_brain;

-- ────────────────────────────────────────────────────────────────────────────
-- Estensione pgcrypto (per digest SHA-256 nella pseudonimizzazione)
-- ────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Estensione companies per opt-in GDPR
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS aedix_brain_opt_in boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS aedix_brain_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS aedix_brain_opt_in_version text;

COMMENT ON COLUMN public.companies.aedix_brain_opt_in IS
  'MP-AEDIX-01: opt-in benchmarking cross-tenant. Default true ma cambiabile da Privacy settings.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Snapshot daily company → schema aedix_brain
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aedix_brain.company_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo_company_id   text NOT NULL,
  snapshot_date       date NOT NULL,
  vertical_key        text NOT NULL,
  province_code       text,
  region_code         text,
  city_population_band text,
  employee_band       text,
  revenue_band        text,
  years_active_band   text,
  active_jobs_count   int,
  avg_job_value_eur   numeric,
  monthly_invoiced_eur numeric,
  monthly_collected_eur numeric,
  dso_days            int,
  active_customers    int,
  conversion_rate_quote numeric,
  ai_credits_consumed_month int,
  active_personas     text[],
  most_used_features  jsonb,
  nps_score           int,
  health_score        int,
  churn_probability   numeric,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pseudo_company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_aedix_snapshots_vertical_date
  ON aedix_brain.company_snapshots(vertical_key, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_aedix_snapshots_province_date
  ON aedix_brain.company_snapshots(province_code, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_aedix_snapshots_region_date
  ON aedix_brain.company_snapshots(region_code, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_aedix_snapshots_pseudo_date
  ON aedix_brain.company_snapshots(pseudo_company_id, snapshot_date DESC);

COMMENT ON TABLE aedix_brain.company_snapshots IS
  'MP-AEDIX-01: snapshot anonimi giornalieri per benchmarking cross-tenant. ZERO PII.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Materialized view market_metrics
-- ────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS aedix_brain.market_metrics;
CREATE MATERIALIZED VIEW aedix_brain.market_metrics AS
SELECT
  vertical_key,
  region_code,
  province_code,
  date_trunc('month', snapshot_date) as month,
  COUNT(DISTINCT pseudo_company_id) as active_companies,
  AVG(monthly_invoiced_eur) as avg_revenue_month,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY monthly_invoiced_eur) as median_revenue,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY monthly_invoiced_eur) as p90_revenue,
  AVG(dso_days) as avg_dso,
  AVG(conversion_rate_quote) as avg_conversion,
  AVG(nps_score) as avg_nps,
  AVG(health_score) as avg_health
FROM aedix_brain.company_snapshots
GROUP BY vertical_key, region_code, province_code, month;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_metrics_unique
  ON aedix_brain.market_metrics(vertical_key, COALESCE(region_code, ''), COALESCE(province_code, ''), month);

COMMENT ON MATERIALIZED VIEW aedix_brain.market_metrics IS
  'MP-AEDIX-01: aggregati per vertical+geografia+mese. Refresh nightly via cron.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Funzione pseudonimizzazione stabile (SHA-256 + salt env)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aedix_brain.pseudo_company_id(p_company_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, aedix_brain
AS $$
DECLARE
  v_salt text;
BEGIN
  -- Salt da env: settare con `ALTER DATABASE postgres SET aedix.salt TO 'secret_value';`
  -- in produzione. Fallback per dev locale (CAMBIARE in prod).
  v_salt := COALESCE(current_setting('aedix.salt', true), 'aedix_dev_fallback_salt_change_me');
  RETURN encode(digest(p_company_id::text || v_salt, 'sha256'), 'hex');
END $$;

REVOKE ALL ON FUNCTION aedix_brain.pseudo_company_id(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION aedix_brain.pseudo_company_id(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Funzioni di banding (employee/revenue/years/population)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aedix_brain.band_employees(emp_count int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN emp_count IS NULL OR emp_count <= 5 THEN '1-5'
    WHEN emp_count <= 10 THEN '6-10'
    WHEN emp_count <= 20 THEN '11-20'
    WHEN emp_count <= 50 THEN '21-50'
    ELSE '51+'
  END
$$;

CREATE OR REPLACE FUNCTION aedix_brain.band_revenue(rev_eur numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN rev_eur IS NULL OR rev_eur < 500000 THEN '<500k'
    WHEN rev_eur < 1000000 THEN '500k-1M'
    WHEN rev_eur < 3000000 THEN '1M-3M'
    WHEN rev_eur < 10000000 THEN '3M-10M'
    ELSE '>10M'
  END
$$;

CREATE OR REPLACE FUNCTION aedix_brain.band_years_active(years numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN years IS NULL OR years < 1 THEN '<1y'
    WHEN years < 3 THEN '1-3y'
    WHEN years < 5 THEN '3-5y'
    WHEN years < 10 THEN '5-10y'
    ELSE '>10y'
  END
$$;

CREATE OR REPLACE FUNCTION aedix_brain.band_population(pop int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN pop IS NULL OR pop < 15000 THEN 'small'
    WHEN pop < 100000 THEN 'medium'
    WHEN pop < 500000 THEN 'large'
    ELSE 'metro'
  END
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) RPC query con K-anonymity (≥5 companies obbligatorio)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aedix_brain_query_market(
  p_vertical_key text,
  p_region_code text DEFAULT NULL,
  p_province_code text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, aedix_brain
AS $$
DECLARE
  v_row record;
  v_count int;
BEGIN
  -- Solo super_admin può accedere all'API brain (in F4 si esporrà ai clienti).
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Brain AEDIX solo per SuperAdmin');
  END IF;

  SELECT *, active_companies AS cnt INTO v_row
    FROM aedix_brain.market_metrics
   WHERE vertical_key = p_vertical_key
     AND (p_region_code IS NULL OR region_code = p_region_code)
     AND (p_province_code IS NULL OR province_code = p_province_code)
   ORDER BY month DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no_data', 'message', 'Nessun dato per i filtri specificati');
  END IF;

  v_count := COALESCE(v_row.cnt, 0);
  IF v_count < 5 THEN
    RETURN jsonb_build_object(
      'error', 'k_anonymity_violation',
      'message', format('Campione insufficiente (%s companies, minimo 5).', v_count),
      'sample_size', v_count
    );
  END IF;

  RETURN jsonb_build_object(
    'sample_size', v_count,
    'vertical', v_row.vertical_key,
    'region', v_row.region_code,
    'province', v_row.province_code,
    'month', v_row.month,
    'avg_revenue_month', v_row.avg_revenue_month,
    'median_revenue', v_row.median_revenue,
    'p90_revenue', v_row.p90_revenue,
    'avg_dso', v_row.avg_dso,
    'avg_conversion', v_row.avg_conversion,
    'avg_nps', v_row.avg_nps,
    'avg_health', v_row.avg_health
  );
END $$;

REVOKE ALL ON FUNCTION public.aedix_brain_query_market FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aedix_brain_query_market TO authenticated, service_role;

COMMENT ON FUNCTION public.aedix_brain_query_market IS
  'MP-AEDIX-01: query brain con k-anonymity ≥ 5. Solo super_admin (F1-F3); F4 esporrà ai clienti.';
