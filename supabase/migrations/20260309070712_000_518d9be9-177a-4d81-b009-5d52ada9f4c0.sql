-- =============================================
-- 1. Company Health Scores (server-side persistence)
-- =============================================
CREATE TABLE public.company_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  health text NOT NULL DEFAULT 'healthy',
  login_score integer NOT NULL DEFAULT 0,
  orders_score integer NOT NULL DEFAULT 0,
  features_score integer NOT NULL DEFAULT 0,
  team_score integer NOT NULL DEFAULT 0,
  engagement_score integer NOT NULL DEFAULT 0,
  churn_risk numeric(5,2) NOT NULL DEFAULT 0,
  signals jsonb DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);
