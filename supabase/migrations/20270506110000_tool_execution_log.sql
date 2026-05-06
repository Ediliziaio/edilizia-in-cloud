-- MP-AIE-01 — Tool Execution Log
-- Audit trail centralizzato per ogni esecuzione di tool dall'agent registry.
-- Usato da: ai-orchestrator (web), whatsapp-ai-processor, internal-agent-tools
-- (voice ElevenLabs), futuri canali (email, SMS).
--
-- Lo scopo è triplice:
--   1. Audit (chi ha eseguito cosa, quando, con quale outcome)
--   2. AI Act compliance (logging interazioni decisionali)
--   3. Debugging (errori, latency, pattern di utilizzo)

CREATE TABLE IF NOT EXISTS public.tool_execution_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  persona_key     text,
  channel         text NOT NULL CHECK (channel IN ('web','mobile','whatsapp','voice','email','cron')),
  tool_name       text NOT NULL,
  tool_domain     text NOT NULL,
  risk_level      text NOT NULL CHECK (risk_level IN ('safe','yellow','red')),
  input_payload   jsonb DEFAULT '{}'::jsonb,
  output_payload  jsonb,
  status          text NOT NULL CHECK (status IN ('success','error','proposed')),
  error_message   text,
  proposal_id     uuid REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,
  duration_ms     int,
  trace_id        text,
  session_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_execution_log_company_date
  ON public.tool_execution_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_tool_date
  ON public.tool_execution_log(tool_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_user_date
  ON public.tool_execution_log(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_status_anomaly
  ON public.tool_execution_log(status, created_at DESC) WHERE status <> 'success';
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_persona
  ON public.tool_execution_log(persona_key, created_at DESC) WHERE persona_key IS NOT NULL;

ALTER TABLE public.tool_execution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tool_execution_log_company_read ON public.tool_execution_log;
CREATE POLICY tool_execution_log_company_read ON public.tool_execution_log FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS tool_execution_log_super_admin ON public.tool_execution_log;
CREATE POLICY tool_execution_log_super_admin ON public.tool_execution_log FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.tool_execution_log IS
  'MP-AIE-01: audit trail di ogni esecuzione tool dal registry condiviso _shared/agent-tools/. AI Act art. 15.';
