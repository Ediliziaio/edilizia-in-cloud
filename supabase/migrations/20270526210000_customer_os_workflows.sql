-- ============================================================================
-- Customer OS — Workflow Registry
-- ============================================================================
-- Gestisce DEFINIZIONI workflow (chi gira quando) + EXECUTION LOG (cosa è
-- successo). Permette di:
--   - Disabilitare un workflow se sta generando rumore
--   - Vedere TEMPI medi di esecuzione per workflow
--   - Identificare workflow failed e ritentare
--   - Audit completo "perchè Sofia ha mandato questa email?"
-- ============================================================================

-- ─── 1) Workflow definitions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_workflows (
  workflow_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  -- Quale agente persona è responsabile
  owner_persona_key TEXT NOT NULL,  -- sofia_onboarding / giorgio_support / elena_cs / tommaso_insight / beatrice_cfo / marco_sales
  -- Trigger type
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('event', 'cron', 'manual', 'realtime')),
  -- Event name che lo triggera (se trigger_type=event)
  trigger_event TEXT,
  -- Cron schedule (se trigger_type=cron)
  cron_schedule TEXT,
  -- Edge function da chiamare
  edge_function_name TEXT NOT NULL,
  -- Modalità approval (auto / auto_notify / approval_required / blocked)
  default_mode TEXT NOT NULL DEFAULT 'auto_notify' CHECK (default_mode IN (
    'auto', 'auto_notify', 'approval_required', 'blocked'
  )),
  -- Risk level per UI
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Cost guard
  max_runs_per_day INT,
  max_cost_usd_per_run NUMERIC(10,4),
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_workflows IS
  'Registry di tutti i workflow agentici. Permette enable/disable run-time + audit.';

ALTER TABLE public.customer_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflows_super_admin_all" ON public.customer_workflows;
CREATE POLICY "workflows_super_admin_all" ON public.customer_workflows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON public.customer_workflows;
CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.customer_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2) Workflow execution log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL REFERENCES public.customer_workflows(workflow_key),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  -- Trigger details
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('event', 'cron', 'manual')),
  trigger_payload JSONB,
  -- Stato esecuzione
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'awaiting_approval', 'completed', 'failed', 'skipped', 'canceled'
  )),
  -- Output
  output JSONB,
  error_message TEXT,
  -- Cost tracking
  tokens_input INT,
  tokens_output INT,
  cost_usd NUMERIC(10,4),
  duration_ms INT,
  -- Approval (se richiesto)
  approval_id UUID,
  approval_resolved_at TIMESTAMPTZ,
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.customer_workflow_runs IS
  'Execution log per ogni run di workflow. Audit completo + cost tracking + retry.';

CREATE INDEX IF NOT EXISTS idx_workflow_runs_company_started
  ON public.customer_workflow_runs(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON public.customer_workflow_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow
  ON public.customer_workflow_runs(workflow_key, started_at DESC);

ALTER TABLE public.customer_workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_runs_super_admin_all" ON public.customer_workflow_runs;
CREATE POLICY "workflow_runs_super_admin_all" ON public.customer_workflow_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "workflow_runs_company_read_own" ON public.customer_workflow_runs;
CREATE POLICY "workflow_runs_company_read_own" ON public.customer_workflow_runs
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─── 3) Bootstrap 12 workflow iniziali ──────────────────────────────────
INSERT INTO public.customer_workflows (
  workflow_key, display_name, description, owner_persona_key,
  trigger_type, trigger_event, cron_schedule, edge_function_name,
  default_mode, risk_level, max_runs_per_day, max_cost_usd_per_run
) VALUES
  -- Sofia Onboarding
  ('onboarding.kickoff_email',
   'Email benvenuto kickoff',
   'Email immediata al nuovo cliente dopo firma (giorno 0)',
   'sofia_onboarding',
   'event', 'company.signed', NULL, 'sofia-onboarding',
   'auto', 'low', NULL, 0.10),

  ('onboarding.day_3_check',
   'Check primo login (giorno 3)',
   'Se cliente non ha ancora fatto primo login: email + slack alert a Florin',
   'sofia_onboarding',
   'cron', NULL, '0 9 * * *', 'sofia-onboarding',
   'auto_notify', 'low', NULL, 0.10),

  ('onboarding.day_7_first_value',
   'Email primo valore (giorno 7)',
   'Tutorial contestuale basato su feature usate fino a oggi',
   'sofia_onboarding',
   'cron', NULL, '0 10 * * *', 'sofia-onboarding',
   'auto_notify', 'low', NULL, 0.10),

  ('onboarding.day_21_call_offer',
   'Offerta call check-in (giorno 21)',
   'Calendly link per call con Florin se onboarding non graduated',
   'sofia_onboarding',
   'cron', NULL, '0 11 * * *', 'sofia-onboarding',
   'approval_required', 'medium', NULL, 0.15),

  -- Giorgio Support
  ('support.ticket_triage',
   'Triage nuovo ticket',
   'Classificazione + sentiment + intent + bozza risposta',
   'giorgio_support',
   'event', 'ticket.created', NULL, 'giorgio-support-triage',
   'auto', 'low', NULL, 0.20),

  ('support.ticket_auto_reply_faq',
   'Auto-reply ticket FAQ',
   'Se intent matcha FAQ con confidence > 90%, risponde da solo',
   'giorgio_support',
   'event', 'ticket.classified', NULL, 'giorgio-support-triage',
   'auto', 'medium', NULL, 0.15),

  -- Elena CS
  ('cs.daily_health_scoring',
   'Health score giornaliero',
   'Calcola health score per ogni azienda attiva',
   'elena_cs',
   'cron', NULL, '0 6 * * *', 'elena-cs-health-daily',
   'auto', 'low', NULL, 2.00),

  ('cs.at_risk_alert',
   'Alert at-risk cliente',
   'Slack + WhatsApp a Florin se cliente passa a at_risk/churned',
   'elena_cs',
   'event', 'customer.health_changed', NULL, 'elena-cs-health-daily',
   'auto', 'low', NULL, 0.05),

  -- Tommaso Insight
  ('insight.daily_usage_report',
   'Report usage giornaliero',
   'Aggregato eventi prodotto + pattern detection per cliente',
   'tommaso_insight',
   'cron', NULL, '0 7 * * *', 'tommaso-insight-daily',
   'auto', 'low', NULL, 3.00),

  ('insight.upsell_signal',
   'Detect upsell signal',
   'Cliente usa > 80% piano O team size cresciuto → suggest upgrade',
   'tommaso_insight',
   'cron', NULL, '0 8 * * 1', 'tommaso-insight-daily',  -- ogni lunedì
   'approval_required', 'medium', NULL, 0.30),

  -- Beatrice CFO
  ('cfo.daily_kpi_brief',
   'Brief KPI giornaliero',
   'MRR delta, churn, payment failures, anomalie',
   'beatrice_cfo',
   'cron', NULL, '0 6 30 * * *', 'beatrice-cfo-daily',
   'auto', 'low', NULL, 0.50),

  ('cfo.payment_failed_alert',
   'Alert payment failure',
   'Stripe webhook → notifica Florin + email cliente',
   'beatrice_cfo',
   'event', 'billing.payment.failed', NULL, 'beatrice-cfo-daily',
   'auto', 'medium', NULL, 0.10),

  -- Marco Sales-Enable
  ('sales.post_demo_followup',
   'Followup post-demo',
   'Riassunto demo + email follow-up + CRM update + proposta link',
   'marco_sales',
   'event', 'demo.completed', NULL, 'marco-sales-postdemo',
   'approval_required', 'medium', NULL, 0.40),

  ('sales.proposal_generator',
   'Generatore proposta commerciale',
   'Genera PDF proposta con pricing + features + case study basati su demo notes',
   'marco_sales',
   'manual', NULL, NULL, 'marco-sales-postdemo',
   'approval_required', 'high', NULL, 1.00)

ON CONFLICT (workflow_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  owner_persona_key = EXCLUDED.owner_persona_key,
  trigger_type = EXCLUDED.trigger_type,
  trigger_event = EXCLUDED.trigger_event,
  cron_schedule = EXCLUDED.cron_schedule,
  edge_function_name = EXCLUDED.edge_function_name,
  default_mode = EXCLUDED.default_mode,
  risk_level = EXCLUDED.risk_level,
  max_runs_per_day = EXCLUDED.max_runs_per_day,
  max_cost_usd_per_run = EXCLUDED.max_cost_usd_per_run,
  updated_at = now();

-- ─── 4) RPC: enqueue workflow run ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_customer_workflow(
  p_workflow_key TEXT,
  p_company_id UUID,
  p_trigger_payload JSONB DEFAULT NULL,
  p_triggered_by TEXT DEFAULT 'event'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow customer_workflows%ROWTYPE;
  v_run_id UUID;
  v_runs_today INT;
BEGIN
  -- Carica workflow
  SELECT * INTO v_workflow FROM public.customer_workflows
   WHERE workflow_key = p_workflow_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_not_found: %', p_workflow_key;
  END IF;
  IF NOT v_workflow.enabled THEN
    RAISE EXCEPTION 'workflow_disabled: %', p_workflow_key;
  END IF;

  -- Cost guard: max_runs_per_day
  IF v_workflow.max_runs_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO v_runs_today
    FROM public.customer_workflow_runs
    WHERE workflow_key = p_workflow_key
      AND started_at >= CURRENT_DATE;
    IF v_runs_today >= v_workflow.max_runs_per_day THEN
      RAISE EXCEPTION 'max_runs_per_day_exceeded: % >= %', v_runs_today, v_workflow.max_runs_per_day;
    END IF;
  END IF;

  -- Enqueue
  INSERT INTO public.customer_workflow_runs (
    workflow_key, company_id, triggered_by, trigger_payload, status
  ) VALUES (
    p_workflow_key, p_company_id, p_triggered_by, p_trigger_payload, 'queued'
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_customer_workflow(TEXT, UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_workflow(TEXT, UUID, JSONB, TEXT)
  TO authenticated, service_role;

-- ─── 5) RPC: complete workflow run ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_workflow_run(
  p_run_id UUID,
  p_status TEXT,
  p_output JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_tokens_input INT DEFAULT NULL,
  p_tokens_output INT DEFAULT NULL,
  p_cost_usd NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed', 'skipped', 'canceled', 'awaiting_approval') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;

  UPDATE public.customer_workflow_runs
     SET status = p_status,
         output = COALESCE(p_output, output),
         error_message = p_error_message,
         tokens_input = p_tokens_input,
         tokens_output = p_tokens_output,
         cost_usd = p_cost_usd,
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::INT * 1000,
         completed_at = CASE
           WHEN p_status IN ('completed', 'failed', 'skipped', 'canceled') THEN now()
           ELSE completed_at
         END
   WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_workflow_run(UUID, TEXT, JSONB, TEXT, INT, INT, NUMERIC)
  TO authenticated, service_role;

-- ─── 6) View: daily workflow stats ──────────────────────────────────────
CREATE OR REPLACE VIEW public.customer_workflow_daily_stats AS
SELECT
  workflow_key,
  DATE(started_at) AS run_date,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE status = 'awaiting_approval') AS awaiting,
  COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
  AVG(duration_ms) FILTER (WHERE status = 'completed')::INT AS avg_duration_ms,
  SUM(cost_usd) AS total_cost_usd,
  SUM(tokens_input) AS total_tokens_input,
  SUM(tokens_output) AS total_tokens_output
FROM public.customer_workflow_runs
WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY workflow_key, DATE(started_at)
ORDER BY DATE(started_at) DESC, workflow_key;

COMMENT ON VIEW public.customer_workflow_daily_stats IS
  'KPI giornalieri per ogni workflow: total runs, success rate, costo, latenza media.';

GRANT SELECT ON public.customer_workflow_daily_stats TO authenticated;
