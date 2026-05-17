-- ============================================================================
-- v8.6.42 — Estende mv_analytics_sede con ordini e fatture
--
-- Razionale: la MV `mv_analytics_sede` aggrega oggi solo quotes + costs +
-- lead. La descrizione UX prometteva "analytics disaggregati su dashboard,
-- ordini e fatturazione" — ordini e fatture NON erano nella MV. Le FK
-- `orders.sede_id` e `invoices.sede_id` esistevano ma erano orfane lato
-- analytics.
--
-- Estensione additiva (backward compatible):
--   - Nuovi field: n_ordini, fatturato_ordini, ordini_completati,
--     n_fatture, fatturato_fatture, fatture_pagate
--   - Tutti i field esistenti (sede_id, mese, ricavi, costi, n_lead, ...)
--     restano identici → get-sede-analytics edge function non si rompe.
--
-- Strategia:
--   1. DROP MV (sicuro: è materializzata, ricostruita 1x ogni 15min)
--   2. Re-CREATE con i CTE aggiuntivi
--   3. Re-CREATE indici
--   4. REFRESH iniziale
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_analytics_sede;

CREATE MATERIALIZED VIEW public.mv_analytics_sede AS
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
),
-- v8.6.42 — Nuovi CTE: ordini e fatture per sede
ordini_agg AS (
  SELECT
    o.sede_id,
    o.company_id,
    DATE_TRUNC('month', o.created_at) AS mese,
    COUNT(o.id)                        AS n_ordini,
    SUM(o.total_amount)                AS tot_ordini,
    -- "Completato" euristica: balance_paid = true → l'ordine è chiuso
    COUNT(CASE WHEN o.balance_paid = true THEN 1 END) AS ordini_completati
  FROM public.orders o
  WHERE o.sede_id IS NOT NULL
  GROUP BY o.sede_id, o.company_id, DATE_TRUNC('month', o.created_at)
),
fatture_agg AS (
  SELECT
    f.sede_id,
    f.company_id,
    DATE_TRUNC('month', f.issue_date) AS mese,
    COUNT(f.id)                        AS n_fatture,
    SUM(f.total)                       AS tot_fatturato,
    COUNT(CASE WHEN f.status = 'paid' THEN 1 END) AS fatture_pagate,
    SUM(CASE WHEN f.status = 'paid' THEN f.total ELSE 0 END) AS tot_pagato
  FROM public.invoices f
  WHERE f.sede_id IS NOT NULL
    AND f.document_type = 'invoice'  -- esclude note credito e altri doc fiscali
  GROUP BY f.sede_id, f.company_id, DATE_TRUNC('month', f.issue_date)
)
SELECT
  COALESCE(r.sede_id,    c.sede_id,    l.sede_id,    o.sede_id,    f.sede_id)    AS sede_id,
  COALESCE(r.company_id, c.company_id, l.company_id, o.company_id, f.company_id) AS company_id,
  COALESCE(r.mese,       c.mese,       l.mese,       o.mese,       f.mese)       AS mese,
  -- Campi esistenti (backward compatible)
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
  END AS cpl,
  -- v8.6.42 — Nuovi campi: ordini e fatture per sede
  COALESCE(o.n_ordini,         0) AS n_ordini,
  COALESCE(o.tot_ordini,       0) AS fatturato_ordini,
  COALESCE(o.ordini_completati,0) AS ordini_completati,
  COALESCE(f.n_fatture,        0) AS n_fatture,
  COALESCE(f.tot_fatturato,    0) AS fatturato_fatture,
  COALESCE(f.fatture_pagate,   0) AS fatture_pagate,
  COALESCE(f.tot_pagato,       0) AS fatturato_pagato
FROM ricavi r
FULL JOIN costi_agg  c USING (sede_id, company_id, mese)
FULL JOIN lead_agg   l USING (sede_id, company_id, mese)
FULL JOIN ordini_agg o USING (sede_id, company_id, mese)
FULL JOIN fatture_agg f USING (sede_id, company_id, mese);

-- Indici (ricostruiti dopo il DROP)
CREATE INDEX IF NOT EXISTS idx_mv_sede_id  ON public.mv_analytics_sede(sede_id);
CREATE INDEX IF NOT EXISTS idx_mv_company  ON public.mv_analytics_sede(company_id);
CREATE INDEX IF NOT EXISTS idx_mv_mese     ON public.mv_analytics_sede(mese);

-- Refresh iniziale per popolare la MV subito (il cron 15min farà refresh
-- CONCURRENTLY successivamente).
REFRESH MATERIALIZED VIEW public.mv_analytics_sede;

-- ============================================================================
-- Nota per il frontend:
-- - get-sede-analytics edge function legge gli stessi campi di prima →
--   nessuna modifica obbligatoria.
-- - Per esporre i nuovi field (n_ordini, fatturato_ordini, n_fatture, ecc.)
--   estendere il SELECT in supabase/functions/get-sede-analytics/index.ts
--   e i type Sede* in src/hooks/useSediAnalytics.ts.
-- ============================================================================
