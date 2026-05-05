-- Platform-level AI usage ledger.
-- Tenant AI calls are charged through ai_call_ledger. SuperAdmin/internal
-- operations such as universal KB ingestion, RAG eval and landing asset
-- generation do not belong to a tenant wallet, but still need cost/audit
-- visibility.

CREATE TABLE IF NOT EXISTS public.platform_ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL,
  provider text NOT NULL,
  model_used text NOT NULL,
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  cost_real_usd numeric(18, 8) NOT NULL DEFAULT 0,
  duration_ms int,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout')),
  error_message text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_ai_usage_log_created
  ON public.platform_ai_usage_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_ai_usage_log_operation
  ON public.platform_ai_usage_log(operation_key, created_at DESC);

ALTER TABLE public.platform_ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_ai_usage_log_super_admin_select" ON public.platform_ai_usage_log;
CREATE POLICY "platform_ai_usage_log_super_admin_select"
ON public.platform_ai_usage_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "platform_ai_usage_log_service_insert" ON public.platform_ai_usage_log;
CREATE POLICY "platform_ai_usage_log_service_insert"
ON public.platform_ai_usage_log
FOR INSERT
WITH CHECK (auth.role() = 'service_role');
