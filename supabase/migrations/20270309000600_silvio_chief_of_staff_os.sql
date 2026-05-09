-- Silvio P2: Chief of Staff OS.
-- Permanent objectives, monitors, experiment engine and strategic daily briefs.

CREATE TABLE IF NOT EXISTS public.silvio_strategic_objectives (
  objective_key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  owner_agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'P1' CHECK (priority IN ('P0', 'P1', 'P2')),
  target_metric text,
  target_value numeric(14,4),
  current_value numeric(14,4),
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_monitor_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  owner_agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  metric_key text NOT NULL,
  condition_operator text NOT NULL CHECK (condition_operator IN ('gt', 'gte', 'lt', 'lte', 'eq', 'neq')),
  threshold_value numeric(14,4) NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  cooldown_minutes integer NOT NULL DEFAULT 1440,
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_monitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.silvio_monitor_rules(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  metric_key text NOT NULL,
  metric_value numeric(14,4),
  threshold_value numeric(14,4),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  summary text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.silvio_growth_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  hypothesis text NOT NULL,
  objective_key text REFERENCES public.silvio_strategic_objectives(objective_key) ON DELETE SET NULL,
  owner_agent_key text REFERENCES public.silvio_agent_registry(agent_key) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'approved', 'running', 'completed', 'rejected', 'archived')),
  priority text NOT NULL DEFAULT 'P1' CHECK (priority IN ('P0', 'P1', 'P2')),
  expected_impact text NOT NULL DEFAULT 'medium' CHECK (expected_impact IN ('low', 'medium', 'high')),
  effort text NOT NULL DEFAULT 'medium' CHECK (effort IN ('low', 'medium', 'high')),
  confidence numeric(4,3),
  metric_name text,
  baseline_value numeric(14,4),
  target_value numeric(14,4),
  start_date date,
  end_date date,
  result_summary text,
  created_from_mission_id uuid REFERENCES public.silvio_agent_missions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.silvio_chief_of_staff_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  for_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'reviewed', 'archived')),
  summary_md text NOT NULL,
  top_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions_needed jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  experiments_suggested jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by text,
  generation_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_monitor_events_status_created
  ON public.silvio_monitor_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_silvio_growth_experiments_status_priority
  ON public.silvio_growth_experiments(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_silvio_chief_briefs_date
  ON public.silvio_chief_of_staff_briefs(for_date DESC);

DROP TRIGGER IF EXISTS trg_silvio_strategic_objectives_updated_at ON public.silvio_strategic_objectives;
CREATE TRIGGER trg_silvio_strategic_objectives_updated_at
  BEFORE UPDATE ON public.silvio_strategic_objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_monitor_rules_updated_at ON public.silvio_monitor_rules;
CREATE TRIGGER trg_silvio_monitor_rules_updated_at
  BEFORE UPDATE ON public.silvio_monitor_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_growth_experiments_updated_at ON public.silvio_growth_experiments;
CREATE TRIGGER trg_silvio_growth_experiments_updated_at
  BEFORE UPDATE ON public.silvio_growth_experiments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_chief_briefs_updated_at ON public.silvio_chief_of_staff_briefs;
CREATE TRIGGER trg_silvio_chief_briefs_updated_at
  BEFORE UPDATE ON public.silvio_chief_of_staff_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.silvio_strategic_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_monitor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_monitor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_growth_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_chief_of_staff_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage silvio strategic objectives" ON public.silvio_strategic_objectives;
CREATE POLICY "Super admins manage silvio strategic objectives"
  ON public.silvio_strategic_objectives FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio monitor rules" ON public.silvio_monitor_rules;
CREATE POLICY "Super admins manage silvio monitor rules"
  ON public.silvio_monitor_rules FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio monitor events" ON public.silvio_monitor_events;
CREATE POLICY "Super admins manage silvio monitor events"
  ON public.silvio_monitor_events FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio growth experiments" ON public.silvio_growth_experiments;
CREATE POLICY "Super admins manage silvio growth experiments"
  ON public.silvio_growth_experiments FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins manage silvio chief briefs" ON public.silvio_chief_of_staff_briefs;
CREATE POLICY "Super admins manage silvio chief briefs"
  ON public.silvio_chief_of_staff_briefs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.silvio_strategic_objectives (
  objective_key, title, description, owner_agent_key, priority, target_metric, target_value, cadence, status, enabled
) VALUES
  ('mrr_growth', 'Crescita MRR', 'Aumentare MRR e qualita dei clienti paganti senza deteriorare supporto o margine.', 'finance_agent', 'P0', 'mrr_eur', null, 'weekly', 'active', true),
  ('lead_conversion', 'Conversione lead', 'Aumentare lead qualificati e conversione demo/trial/paying con follow-up misurabili.', 'growth_agent', 'P0', 'hot_leads', null, 'weekly', 'active', true),
  ('churn_reduction', 'Riduzione churn', 'Intercettare clienti a rischio, ticket ricorrenti e pagamenti falliti prima che diventino churn.', 'customer_success_agent', 'P0', 'companies_unpaid', 0, 'daily', 'active', true),
  ('ai_cost_control', 'Controllo costi AI', 'Tenere costo AI sotto controllo mantenendo qualita e velocita del prodotto.', 'product_tech_agent', 'P1', 'ai_cost_mtd_eur', null, 'weekly', 'active', true),
  ('product_stability', 'Stabilita prodotto', 'Ridurre regressioni, blocchi UI, ticket tecnici e failure operative.', 'product_tech_agent', 'P1', 'open_tickets_total', null, 'weekly', 'active', true)
ON CONFLICT (objective_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  owner_agent_key = EXCLUDED.owner_agent_key,
  priority = EXCLUDED.priority,
  target_metric = EXCLUDED.target_metric,
  target_value = EXCLUDED.target_value,
  cadence = EXCLUDED.cadence,
  status = EXCLUDED.status,
  enabled = EXCLUDED.enabled,
  updated_at = now();

INSERT INTO public.silvio_monitor_rules (
  rule_key, title, description, owner_agent_key, metric_key, condition_operator, threshold_value, severity, cooldown_minutes, enabled
) VALUES
  ('unpaid_customers_present', 'Pagamenti falliti presenti', 'Apre evento quando esistono aziende unpaid/past_due.', 'finance_agent', 'companies_unpaid', 'gt', 0, 'high', 720, true),
  ('ai_cost_mtd_high', 'Costo AI MTD alto', 'Apre evento se il costo reale AI del mese supera la soglia iniziale.', 'product_tech_agent', 'ai_cost_mtd_eur', 'gt', 100, 'medium', 1440, true),
  ('support_queue_high', 'Coda supporto alta', 'Apre evento se i ticket aperti superano la soglia.', 'customer_success_agent', 'open_tickets_total', 'gt', 10, 'high', 720, true),
  ('hot_leads_available', 'Lead caldi da lavorare', 'Apre evento quando ci sono lead caldi non ancora trasformati in azione.', 'sales_agent', 'hot_leads_returned', 'gt', 0, 'medium', 360, true),
  ('agent_reviews_waiting', 'Missioni agenti in review', 'Apre evento se ci sono missioni multi-agente in attesa di approvazione.', 'qa_compliance_agent', 'agent_missions_waiting_approval', 'gt', 0, 'medium', 360, true)
ON CONFLICT (rule_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  owner_agent_key = EXCLUDED.owner_agent_key,
  metric_key = EXCLUDED.metric_key,
  condition_operator = EXCLUDED.condition_operator,
  threshold_value = EXCLUDED.threshold_value,
  severity = EXCLUDED.severity,
  cooldown_minutes = EXCLUDED.cooldown_minutes,
  enabled = EXCLUDED.enabled,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.silvio_update_experiment_status(
  p_experiment_id uuid,
  p_status text,
  p_result_summary text DEFAULT null
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  IF p_status NOT IN ('suggested', 'approved', 'running', 'completed', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Invalid experiment status: %', p_status;
  END IF;

  UPDATE public.silvio_growth_experiments
  SET
    status = p_status,
    result_summary = COALESCE(p_result_summary, result_summary),
    start_date = CASE WHEN p_status = 'running' AND start_date IS NULL THEN CURRENT_DATE ELSE start_date END,
    end_date = CASE WHEN p_status IN ('completed', 'rejected', 'archived') AND end_date IS NULL THEN CURRENT_DATE ELSE end_date END,
    updated_at = now()
  WHERE id = p_experiment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Experiment not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_update_experiment_status(uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('silvio-chief-of-staff-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-chief-of-staff-daily');

    PERFORM cron.schedule(
      'silvio-chief-of-staff-daily',
      '15 6 * * *',
      $cron$ SELECT public.silvio_invoke_edge('silvio-chief-of-staff', '{"generate_experiments": true}'::jsonb); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'silvio-chief-of-staff-daily cron not scheduled: %', SQLERRM;
END $$;
