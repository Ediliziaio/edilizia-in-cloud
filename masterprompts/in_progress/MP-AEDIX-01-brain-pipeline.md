# MP-AEDIX-01 — Schema Brain AEDIX + Pipeline Aggregazione + Opt-in GDPR

## 🎯 Obiettivo
Costruire un Brain di livello cross-tenant che aggrega dati anonimizzati da TUTTI
i tenant per dare statistiche di mercato, benchmarking, trend, predittive a Florin
(SuperAdmin AEDIX) e — in F4 — ai clienti EiC come feature premium.

## 📦 Context
- **Branch**: `feat/mp-aedix-01-brain-pipeline`
- **Dipendenze**: MP-VERT-01 (per `vertical_key` su companies)

## 🔒 Privacy & GDPR — Vincoli non negoziabili

1. **Pseudonimizzazione**: zero PII. Solo aggregati e categorie.
2. **K-anonymity ≥ 5**: nessuna query restituisce dati di < 5 companies.
3. **Opt-in esplicito**: clausola nei ToS aggiornata. Default: opt-in (ma opt-out dalle impostazioni privacy).
4. **DPA aggiornata**: trattamento dati per fini di benchmarking di settore (legittimo interesse + opt-in).
5. **Data residency UE**: snapshot store EU only.
6. **Auto-delete**: snapshot più vecchi di 36 mesi auto-eliminati.

## 🛠️ Implementazione

### Step 1 — Schema schema separato `aedix_brain`
File: `supabase/migrations/[timestamp]_aedix_brain_schema.sql`

```sql
CREATE SCHEMA IF NOT EXISTS aedix_brain;

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
  created_at          timestamptz DEFAULT now(),
  UNIQUE(pseudo_company_id, snapshot_date)
);

CREATE INDEX ON aedix_brain.company_snapshots(vertical_key, snapshot_date);
CREATE INDEX ON aedix_brain.company_snapshots(province_code, snapshot_date);
CREATE INDEX ON aedix_brain.company_snapshots(region_code, snapshot_date);

CREATE MATERIALIZED VIEW IF NOT EXISTS aedix_brain.market_metrics AS
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
  AVG(nps_score) as avg_nps
FROM aedix_brain.company_snapshots
GROUP BY vertical_key, region_code, province_code, month;

CREATE INDEX ON aedix_brain.market_metrics(vertical_key, month);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS aedix_brain_opt_in boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS aedix_brain_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS aedix_brain_opt_in_version text;

-- Funzione pseudonimizzazione stabile
CREATE OR REPLACE FUNCTION aedix_brain.pseudo_company_id(p_company_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt text;
BEGIN
  -- Salt segreto immutabile (settato in env)
  v_salt := COALESCE(current_setting('aedix.salt', true), 'fallback_salt_change_me');
  RETURN encode(digest(p_company_id::text || v_salt, 'sha256'), 'hex');
END $$;

-- Funzione aggregazione per company in band
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
```

### Step 2 — Pipeline aggregazione (cron daily)
File: `supabase/functions/aedix-brain-snapshot/index.ts`

Per ogni company con `aedix_brain_opt_in = true`:
1. Calcola tutte le metriche del giorno (active_jobs, monthly_invoiced, ecc.)
2. INSERT in `aedix_brain.company_snapshots` con pseudo_company_id

```sql
SELECT cron.schedule(
  'aedix-brain-snapshot-daily',
  '0 2 * * *',  -- ogni notte 02:00 UTC
  $$ SELECT net.http_post(
    url := 'https://[project].supabase.co/functions/v1/aedix-brain-snapshot',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_token'))
  ) $$
);

-- Refresh materialized view nightly
SELECT cron.schedule(
  'aedix-brain-mv-refresh',
  '0 3 * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY aedix_brain.market_metrics $$
);

-- Auto-delete snapshot > 36 mesi
SELECT cron.schedule(
  'aedix-brain-retention',
  '0 4 1 * *',  -- ogni 1° del mese
  $$ DELETE FROM aedix_brain.company_snapshots WHERE created_at < NOW() - INTERVAL '36 months' $$
);
```

### Step 3 — Query API con K-anonymity
File: `supabase/functions/_shared/aedixBrainQueries.ts`

```typescript
export async function queryMarketMetrics(args: {
  vertical_key: string;
  region_code?: string;
  province_code?: string;
  employee_band?: string;
  revenue_band?: string;
}) {
  // Query con WHERE filters
  const { data } = await supabase.from('aedix_brain.market_metrics').select('*')...
  if ((data?.[0]?.active_companies ?? 0) < 5) {
    return { error: 'k_anonymity_violation', message: 'Campione insufficiente (<5 companies)' };
  }
  return { data };
}
```

### Step 4 — UI privacy
File: `src/pages/azienda/impostazioni/PrivacyAedixBrain.tsx`
- Toggle opt-in/opt-out
- Spiegazione cosa viene aggregato (e cosa NO)
- Link DPA aggiornato

## ✅ Acceptance Criteria
- [ ] Schema `aedix_brain.company_snapshots` + materialized view
- [ ] Pipeline cron daily snapshot funzionante
- [ ] Pseudonimizzazione SHA-256 + salt env
- [ ] K-anonymity check su tutte le query
- [ ] Opt-in/opt-out UI
- [ ] Auto-delete > 36 mesi
- [ ] Test E2E: snapshot 5 companies → query ritorna aggregato
- [ ] DPA documento legale aggiornato (placeholder TODO)
- [ ] TypeScript 0 errori

## 🔗 Risorse
- Doc fonte: `EiC-Verticali-BrainAEDIX-PricingAI.md` (PARTE 2)
