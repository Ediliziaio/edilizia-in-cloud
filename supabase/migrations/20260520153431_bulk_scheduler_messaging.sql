-- ============================================================================
-- Bulk Scheduler Messaging — MVP
-- ----------------------------------------------------------------------------
-- Estende il sistema automazioni esistente per supportare "messaggi programmati"
-- che NON partono da un trigger event su un singolo contatto (es. contact_created)
-- ma da un cron schedule + target group (es. tutti gli operai ogni mattina 07:00).
--
-- Approccio: NON creiamo un sistema parallelo. Riusiamo `automation_flows`
-- aggiungendo:
--   - colonna `bulk_trigger_config` (jsonb) che descrive cron + target + channels
--   - tabella `user_messaging_channels` per preferenze canale per utente
--   - tabella `bulk_scheduler_runs` per log esecuzioni (cosa è andato a chi)
--
-- Le execution per-target restano in `automation_execution_log` esistente.
-- ============================================================================

-- ─── 1. Preferenze canale per utente ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_messaging_channels (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,

  silvio_chat_enabled boolean NOT NULL DEFAULT true,

  telegram_chat_id text,
  telegram_verified_at timestamptz,

  whatsapp_phone text,
  whatsapp_verified_at timestamptz,

  email_enabled boolean NOT NULL DEFAULT true,
  email_override text,

  -- Ordine fallback: es. ["silvio_chat", "telegram", "whatsapp", "email"]
  preferred_order jsonb NOT NULL DEFAULT '["silvio_chat", "email"]'::jsonb,

  quiet_from time,
  quiet_to time,
  quiet_timezone text DEFAULT 'Europe/Rome',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_umc_company ON public.user_messaging_channels(company_id);

ALTER TABLE public.user_messaging_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "umc_self_read" ON public.user_messaging_channels
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "umc_self_write" ON public.user_messaging_channels
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "umc_admin_read_company" ON public.user_messaging_channels
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('company_admin', 'super_admin')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.user_messaging_channels TO authenticated;
GRANT ALL ON public.user_messaging_channels TO service_role;

-- ─── 2. Bulk trigger config su automation_flows ──────────────────────────
ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS bulk_trigger_config jsonb;

CREATE INDEX IF NOT EXISTS idx_automation_flows_bulk_next_run
  ON public.automation_flows ((bulk_trigger_config->>'next_run_at'))
  WHERE bulk_trigger_config IS NOT NULL AND status = 'published';

-- ─── 3. Log esecuzioni bulk ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bulk_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  scheduled_for timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,

  targets_resolved int NOT NULL DEFAULT 0,
  sent_ok int NOT NULL DEFAULT 0,
  sent_failed int NOT NULL DEFAULT 0,
  channel_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bulk_runs_flow_recent
  ON public.bulk_scheduler_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_runs_company_recent
  ON public.bulk_scheduler_runs (company_id, started_at DESC);

ALTER TABLE public.bulk_scheduler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_runs_company_read" ON public.bulk_scheduler_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = bulk_scheduler_runs.company_id
    )
  );

GRANT SELECT ON public.bulk_scheduler_runs TO authenticated;
GRANT ALL ON public.bulk_scheduler_runs TO service_role;

-- ─── 4. RPC: find flow da eseguire ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_scheduler_due_flows()
RETURNS TABLE (
  flow_id uuid,
  company_id uuid,
  flow_name text,
  config jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    af.id as flow_id,
    af.company_id,
    af.name as flow_name,
    af.bulk_trigger_config as config
  FROM public.automation_flows af
  WHERE af.status = 'published'
    AND af.bulk_trigger_config IS NOT NULL
    AND (af.bulk_trigger_config->>'next_run_at')::timestamptz <= now()
  ORDER BY (af.bulk_trigger_config->>'next_run_at')::timestamptz ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.bulk_scheduler_due_flows() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_scheduler_due_flows() TO service_role;

-- ─── 5. RPC: update next_run_at dopo esecuzione ──────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_scheduler_mark_executed(
  p_flow_id uuid,
  p_next_run_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.automation_flows
  SET bulk_trigger_config = jsonb_set(
        jsonb_set(
          bulk_trigger_config,
          '{last_run_at}',
          to_jsonb(now())
        ),
        '{next_run_at}',
        to_jsonb(p_next_run_at)
      ),
      updated_at = now()
  WHERE id = p_flow_id;
$$;

REVOKE ALL ON FUNCTION public.bulk_scheduler_mark_executed(uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_scheduler_mark_executed(uuid, timestamptz) TO service_role;

-- ─── 6. RPC: resolve target users ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_scheduler_resolve_targets(
  p_company_id uuid,
  p_target_type text,
  p_target_value text
)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_type = 'role' THEN
    RETURN QUERY
      SELECT DISTINCT p.id, p.first_name, p.email
      FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.company_id = p_company_id
        AND ur.role::text = p_target_value
        AND COALESCE(p.is_blocked, false) = false;
  ELSIF p_target_type = 'all_company_admins' THEN
    RETURN QUERY
      SELECT DISTINCT p.id, p.first_name, p.email
      FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.company_id = p_company_id
        AND ur.role::text IN ('company_admin', 'super_admin')
        AND COALESCE(p.is_blocked, false) = false;
  ELSIF p_target_type = 'all_workers' THEN
    RETURN QUERY
      SELECT DISTINCT p.id, p.first_name, p.email
      FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.company_id = p_company_id
        AND ur.role::text IN ('worker', 'employee')
        AND COALESCE(p.is_blocked, false) = false;
  ELSE
    RETURN;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_scheduler_resolve_targets(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_scheduler_resolve_targets(uuid, text, text) TO service_role;

COMMENT ON TABLE public.user_messaging_channels IS
'Preferenze canale notifiche per utente. Driver del fallback chain del bulk scheduler.';

COMMENT ON COLUMN public.automation_flows.bulk_trigger_config IS
'Quando NOT NULL, il flow è un "messaggio programmato bulk" gestito da automation-bulk-scheduler-runner. Schema JSON: type+cron+timezone+target+channels+template+next_run_at.';

COMMENT ON TABLE public.bulk_scheduler_runs IS
'Log esecuzioni di automation_flows con bulk_trigger_config. Una riga per RUN. Dettagli per-target in automation_execution_log.';
