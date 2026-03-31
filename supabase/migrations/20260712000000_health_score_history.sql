-- Migration: health_score_history
-- Tracks historical health scores for trend analysis.

CREATE TABLE IF NOT EXISTS public.health_score_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  score        integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  health       text NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_score_history_company
  ON public.health_score_history(company_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_score_history_at
  ON public.health_score_history(calculated_at DESC);

-- RLS
ALTER TABLE public.health_score_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read health score history" ON public.health_score_history;
CREATE POLICY "Super admins read health score history"
  ON public.health_score_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Service role manage health score history" ON public.health_score_history;
CREATE POLICY "Service role manage health score history"
  ON public.health_score_history FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
