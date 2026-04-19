-- ============================================================================
-- RENDER ECONOMICS ALERTS (Supermaster — Parte B7)
--
-- Tabella che raccoglie le anomalie rilevate dall'edge function scheduled
-- `render-economics-monitor` (margine negativo, costo anomalo, mismatch
-- crediti/fatturato). Le righe restano finché un super_admin non le risolve
-- (resolved_at = now()).
--
-- Idempotente: IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.render_economics_alerts (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid         REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Tipo di anomalia rilevata. Esteso quando il monitor copre nuovi casi.
  alert_type    text         NOT NULL CHECK (alert_type IN (
                    'negative_margin',     -- margine sommato < 0 nel periodo
                    'high_cost_per_render',-- costo medio > soglia (provider switch?)
                    'zero_revenue_usage'   -- render consumati senza alcun revenue FIFO
                 )),
  severity      text         NOT NULL DEFAULT 'warning'
                    CHECK (severity IN ('info','warning','critical')),
  period_from   timestamptz  NOT NULL,
  period_to     timestamptz  NOT NULL,
  renders_count integer      NOT NULL DEFAULT 0,
  cost_total    numeric(10,4) NOT NULL DEFAULT 0,
  revenue_total numeric(10,4) NOT NULL DEFAULT 0,
  margin_total  numeric(10,4) NOT NULL DEFAULT 0,
  details       jsonb        NOT NULL DEFAULT '{}'::jsonb,
  alerted_at    timestamptz  NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text
);

CREATE INDEX IF NOT EXISTS idx_rea_company_alerted
  ON public.render_economics_alerts(company_id, alerted_at DESC);
CREATE INDEX IF NOT EXISTS idx_rea_unresolved
  ON public.render_economics_alerts(alerted_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rea_type
  ON public.render_economics_alerts(alert_type, alerted_at DESC);

-- Evita duplicati per stessa company/tipo/periodo (run idempotenti del cron)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rea_company_type_period
  ON public.render_economics_alerts(company_id, alert_type, period_from, period_to)
  WHERE resolved_at IS NULL;

ALTER TABLE public.render_economics_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_read_economics_alerts" ON public.render_economics_alerts;
CREATE POLICY "sa_read_economics_alerts" ON public.render_economics_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "sa_write_economics_alerts" ON public.render_economics_alerts;
CREATE POLICY "sa_write_economics_alerts" ON public.render_economics_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Service-role (edge function) bypassa RLS, quindi l'insert del monitor
-- non richiede policy dedicata.

COMMENT ON TABLE public.render_economics_alerts IS
'Anomalie economics rilevate dal cron render-economics-monitor.
Popolata da service-role (edge function), risolvibile solo da super_admin.';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
