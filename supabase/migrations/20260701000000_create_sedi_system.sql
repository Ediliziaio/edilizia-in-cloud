-- ============================================================
-- MIGRATION: Multi-Sede System
-- Tabella sedi, sede_id sulle tabelle principali,
-- vista materializzata analytics, RLS, pg_cron refresh
-- ============================================================

-- 1. TABELLA SEDI
CREATE TABLE IF NOT EXISTS public.sedi (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('showroom','magazzino','cantiere','ufficio','altro')),
  indirizzo   TEXT,
  citta       TEXT,
  cap         TEXT,
  provincia   TEXT,
  colore      TEXT DEFAULT '#1E3A5F',        -- hex per UI badge
  attiva      BOOLEAN DEFAULT TRUE,
  principale  BOOLEAN DEFAULT FALSE,          -- solo 1 per azienda
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sedi_company   ON public.sedi(company_id);
CREATE INDEX IF NOT EXISTS idx_sedi_tipo      ON public.sedi(tipo);
CREATE INDEX IF NOT EXISTS idx_sedi_attiva    ON public.sedi(company_id, attiva);

-- Trigger updated_at
CREATE TRIGGER trg_sedi_updated_at
  BEFORE UPDATE ON public.sedi
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. AGGIUNGI sede_id ALLE TABELLE PRINCIPALI

-- Preventivi / Offerte (quotes)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES public.sedi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_sede ON public.quotes(sede_id);

-- Ordini / Commesse (orders)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES public.sedi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_sede ON public.orders(sede_id);

-- Lead / Contatti (marketing_contacts)
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES public.sedi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_sede ON public.marketing_contacts(sede_id);

-- Costi aziendali (company_costs)
ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES public.sedi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_company_costs_sede ON public.company_costs(sede_id);

-- Fatture (invoices)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES public.sedi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_sede ON public.invoices(sede_id);

-- 3. VISTA MATERIALIZZATA PER ANALYTICS
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_analytics_sede AS
WITH ricavi AS (
  SELECT
    q.sede_id,
    q.company_id,
    DATE_TRUNC('month', q.created_at) AS mese,
    SUM(q.total)                       AS tot_ricavi,
    COUNT(q.id)                        AS n_preventivi,
    COUNT(CASE WHEN q.status = 'accettato' THEN 1 END) AS preventivi_vinti,
    SUM(CASE WHEN q.status = 'accettato' THEN q.total ELSE 0 END) AS ricavi_confermati
  FROM public.quotes q
  WHERE q.sede_id IS NOT NULL
  GROUP BY q.sede_id, q.company_id, DATE_TRUNC('month', q.created_at)
),
costi_agg AS (
  SELECT
    c.sede_id,
    c.company_id,
    DATE_TRUNC('month', c.created_at) AS mese,
    SUM(c.amount)                      AS tot_costi
  FROM public.company_costs c
  WHERE c.sede_id IS NOT NULL
  GROUP BY c.sede_id, c.company_id, DATE_TRUNC('month', c.created_at)
),
lead_agg AS (
  SELECT
    l.sede_id,
    l.company_id,
    DATE_TRUNC('month', l.created_at) AS mese,
    COUNT(l.id)                        AS n_lead,
    0::NUMERIC                         AS tot_spesa_ads
  FROM public.marketing_contacts l
  WHERE l.sede_id IS NOT NULL
  GROUP BY l.sede_id, l.company_id, DATE_TRUNC('month', l.created_at)
)
SELECT
  COALESCE(r.sede_id,    c.sede_id,    l.sede_id)    AS sede_id,
  COALESCE(r.company_id, c.company_id, l.company_id) AS company_id,
  COALESCE(r.mese,       c.mese,       l.mese)       AS mese,
  COALESCE(r.tot_ricavi, 0)                           AS ricavi,
  COALESCE(c.tot_costi,  0)                           AS costi,
  COALESCE(r.tot_ricavi, 0) - COALESCE(c.tot_costi, 0) AS margine,
  CASE
    WHEN COALESCE(r.tot_ricavi, 0) > 0
    THEN ROUND(((COALESCE(r.tot_ricavi,0) - COALESCE(c.tot_costi,0))
                / COALESCE(r.tot_ricavi,0)) * 100, 2)
    ELSE 0
  END AS margine_pct,
  COALESCE(r.n_preventivi,    0) AS n_preventivi,
  COALESCE(r.preventivi_vinti, 0) AS preventivi_vinti,
  COALESCE(l.n_lead,          0) AS n_lead,
  COALESCE(l.tot_spesa_ads,   0) AS spesa_ads,
  CASE
    WHEN COALESCE(l.n_lead, 0) > 0
    THEN ROUND(COALESCE(l.tot_spesa_ads, 0) / l.n_lead, 2)
    ELSE 0
  END AS cpl
FROM ricavi r
FULL JOIN costi_agg c USING (sede_id, company_id, mese)
FULL JOIN lead_agg  l USING (sede_id, company_id, mese);

-- Indici sulla vista materializzata
CREATE INDEX IF NOT EXISTS idx_mv_sede_id  ON public.mv_analytics_sede(sede_id);
CREATE INDEX IF NOT EXISTS idx_mv_company  ON public.mv_analytics_sede(company_id);
CREATE INDEX IF NOT EXISTS idx_mv_mese     ON public.mv_analytics_sede(mese);

-- 4. ROW LEVEL SECURITY
ALTER TABLE public.sedi ENABLE ROW LEVEL SECURITY;

CREATE POLICY sedi_select ON public.sedi
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY sedi_insert ON public.sedi
  FOR INSERT WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY sedi_update ON public.sedi
  FOR UPDATE USING (company_id = public.get_my_company_id());

CREATE POLICY sedi_delete ON public.sedi
  FOR DELETE USING (company_id = public.get_my_company_id());

-- 5. pg_cron: refresh vista materializzata ogni 15 minuti
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-analytics-sede') THEN
    PERFORM cron.unschedule('refresh-analytics-sede');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-analytics-sede',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_analytics_sede$$
);
