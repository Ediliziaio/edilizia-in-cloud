-- ════════════════════════════════════════════════════════════════════════════
-- AI Feature #13 — Workflow durable multi-step (scaffolding)
-- ────────────────────────────────────────────────────────────────────────────
-- Motore minimale per workflow lunghi (giorni/settimane) tipo:
--   "Ticket aperto → AI risponde → cliente conferma → schedula tecnico →
--    SMS reminder → check-in → rapportino → firma → fattura"
--
-- Schema:
--   - ai_workflows: template definito da admin (JSON con step + transizioni)
--   - ai_workflow_runs: istanza in esecuzione (1 run = 1 esecuzione end-to-end)
--   - ai_workflow_steps_log: log eventi per ogni step
--
-- Lo scheduling effettivo dei step (wake-up futuri) usa pg_cron + il worker
-- ai-workflow-engine che processa runs in stato 'ready'.
--
-- STATO: scaffolding minimale. Niente è eseguito automaticamente: il template
-- esiste, il worker pure, ma le istanze concrete vanno create da chiamate
-- esplicite. Behavior-preserving.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  /** JSON: [{ id, kind, wait_until?, action_type?, condition? }, ...] */
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Trigger: signal_type oppure 'manual' */
  trigger_type text NOT NULL DEFAULT 'manual',
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_workflows_company_active
  ON public.ai_workflows(company_id, is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.ai_workflow_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES public.ai_workflows(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  /** Stato della run: ready | running | waiting | completed | failed | cancelled */
  status          text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','running','waiting','completed','failed','cancelled')),
  current_step_idx int NOT NULL DEFAULT 0,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  /** Quando il prossimo step deve essere risvegliato (per status='waiting') */
  resume_at       timestamptz,
  /** Entità di riferimento (es. ticket_id, order_id) per dedup */
  related_entity_type text,
  related_entity_id   uuid,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  last_error      text,
  attempts        int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_ready
  ON public.ai_workflow_runs(resume_at, status)
  WHERE status IN ('ready','waiting');
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_company
  ON public.ai_workflow_runs(company_id, status);
-- Dedup: massimo 1 run aperto per (workflow, entity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_workflow_runs_entity_dedup
  ON public.ai_workflow_runs(workflow_id, related_entity_type, related_entity_id)
  WHERE status IN ('ready','running','waiting');

CREATE TABLE IF NOT EXISTS public.ai_workflow_steps_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.ai_workflow_runs(id) ON DELETE CASCADE,
  step_idx    int NOT NULL,
  step_kind   text NOT NULL,
  status      text NOT NULL CHECK (status IN ('started','succeeded','failed','skipped')),
  result      jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_steps_log_run
  ON public.ai_workflow_steps_log(run_id, created_at DESC);

ALTER TABLE public.ai_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_steps_log ENABLE ROW LEVEL SECURITY;

-- RLS read: company users vedono i loro workflow + run
DROP POLICY IF EXISTS ai_workflows_read ON public.ai_workflows;
CREATE POLICY ai_workflows_read ON public.ai_workflows FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS ai_workflows_write ON public.ai_workflows;
CREATE POLICY ai_workflows_write ON public.ai_workflows FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS ai_workflow_runs_read ON public.ai_workflow_runs;
CREATE POLICY ai_workflow_runs_read ON public.ai_workflow_runs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS ai_workflow_steps_log_read ON public.ai_workflow_steps_log;
CREATE POLICY ai_workflow_steps_log_read ON public.ai_workflow_steps_log FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.ai_workflow_runs r
      WHERE r.id = ai_workflow_steps_log.run_id
        AND r.company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_ai_workflows_updated_at ON public.ai_workflows;
CREATE TRIGGER update_ai_workflows_updated_at
  BEFORE UPDATE ON public.ai_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
