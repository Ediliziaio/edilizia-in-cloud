-- ════════════════════════════════════════════════════════════════
-- Velocity Protocol — Sprint 1.B — Web Vitals RUM (Real User Monitoring)
--
-- Tabella per raccogliere metriche Web Vitals (LCP, INP, CLS, TTFB,
-- FCP) inviate dal browser via edge function web-vitals-collect.
--
-- Filosofia:
--   • INSERT-only, no update. Una riga per osservazione.
--   • RLS restrittiva: scrittura riservata alla service role via edge
--     function; lettura per super_admin (analisi trend).
--   • Indici su (name, created_at) e (path, created_at) per query p75
--     veloce.
--
-- Retention: i dati hanno valore per trend a 7-30gg. Una cron pulisce
-- > 90gg (opzionale, da schedulare manualmente se serve).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.web_vitals_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Identità (ottimistico: user_id opzionale, non blocchiamo se non loggato)
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id   UUID,
  session_id   TEXT,
  -- Metrica
  name         TEXT NOT NULL CHECK (name IN ('LCP','INP','CLS','TTFB','FCP','FID')),
  value        NUMERIC NOT NULL,
  rating       TEXT CHECK (rating IN ('good','needs-improvement','poor')),
  delta        NUMERIC,
  metric_id    TEXT,              -- id univoco della metrica dal client (per dedup)
  navigation_type TEXT,           -- 'navigate','reload','back-forward','prerender'
  -- Contesto
  path         TEXT,              -- location.pathname
  user_agent   TEXT,
  effective_type TEXT,            -- navigator.connection.effectiveType: '4g', '3g', '2g', 'slow-2g'
  device_memory NUMERIC,          -- navigator.deviceMemory (GB, se esposto)
  hardware_concurrency INT
);

COMMENT ON TABLE public.web_vitals_events IS
  'Velocity RUM: metriche Web Vitals raccolte dal browser. INSERT-only, lettura solo super_admin.';

-- Indici per query p75 veloci
CREATE INDEX IF NOT EXISTS idx_web_vitals_name_created
  ON public.web_vitals_events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_vitals_path_created
  ON public.web_vitals_events (path, created_at DESC) WHERE path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_vitals_company
  ON public.web_vitals_events (company_id, name, created_at DESC) WHERE company_id IS NOT NULL;

-- RLS: nessuno può leggere/scrivere da client diretto
ALTER TABLE public.web_vitals_events ENABLE ROW LEVEL SECURITY;

-- Nessuna policy INSERT per authenticated/anon → l'INSERT avviene solo
-- tramite service role dalla edge function.

-- Policy SELECT: solo super_admin
DROP POLICY IF EXISTS "web_vitals_super_admin_read" ON public.web_vitals_events;
CREATE POLICY "web_vitals_super_admin_read"
  ON public.web_vitals_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT ON public.web_vitals_events TO authenticated;
-- INSERT rimane implicito al service_role (bypassa RLS)

-- ──────────────────────────────────────────────────────────────────
-- View riassuntiva p75 per ultimi 7 giorni (comoda per dashboard admin)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.web_vitals_p75_7d AS
SELECT
  name,
  COUNT(*)                                                   AS samples,
  ROUND(percentile_cont(0.5)  WITHIN GROUP (ORDER BY value)::numeric, 2) AS p50,
  ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY value)::numeric, 2) AS p75,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY value)::numeric, 2) AS p95,
  ROUND(AVG(value)::numeric, 2)                              AS avg,
  COUNT(*) FILTER (WHERE rating = 'good')                    AS good,
  COUNT(*) FILTER (WHERE rating = 'needs-improvement')       AS needs_improvement,
  COUNT(*) FILTER (WHERE rating = 'poor')                    AS poor
FROM public.web_vitals_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY name;

COMMENT ON VIEW public.web_vitals_p75_7d IS
  'Velocity RUM: p50/p75/p95 per ogni Web Vital negli ultimi 7 giorni + conteggi per rating.';

GRANT SELECT ON public.web_vitals_p75_7d TO authenticated;
