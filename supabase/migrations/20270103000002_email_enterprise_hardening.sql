-- ============================================================================
-- Email enterprise hardening
-- ============================================================================
-- Obiettivi:
--   - lookup suppression tenant-safe e stream-aware
--   - indici per delivery log, retry/idempotenza best-effort e dashboard admin
--   - campagne massive senza scan inutili su contatti e suppression list
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_suppressed_for_stream(
  p_email TEXT,
  p_company_id UUID DEFAULT NULL,
  p_stream TEXT DEFAULT 'marketing'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_suppressions
    WHERE email_normalized = lower(btrim(p_email))
      AND (
        (
          company_id IS NULL
          AND (
            (p_stream = 'marketing' AND reason IN ('hard_bounce', 'spam_complaint', 'manual', 'invalid', 'legal', 'unsubscribe'))
            OR (p_stream <> 'marketing' AND reason IN ('hard_bounce', 'spam_complaint', 'manual', 'invalid', 'legal'))
          )
        )
        OR (
          company_id = p_company_id
          AND (
            (p_stream = 'marketing' AND reason IN ('hard_bounce', 'spam_complaint', 'manual', 'invalid', 'legal', 'unsubscribe'))
            OR (p_stream <> 'marketing' AND reason IN ('hard_bounce', 'spam_complaint', 'manual', 'invalid', 'legal'))
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_suppressed_for_stream(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_suppressed_for_stream(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_suppressed_for_stream(TEXT, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.is_suppressed_for_stream(TEXT, UUID, TEXT) IS
  'Suppression lookup stream-aware: marketing rispetta unsubscribe per-company; transactional blocca solo bounce/spam/manual/legal/invalid.';

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS email_suppressions_lookup_reason_idx
  ON public.email_suppressions(email_normalized, company_id, reason);

CREATE INDEX IF NOT EXISTS email_logs_campaign_contact_status_idx
  ON public.email_logs(campaign_id, contact_id, status);

CREATE INDEX IF NOT EXISTS email_logs_company_event_status_idx
  ON public.email_logs(company_id, event_timestamp DESC, status);

CREATE INDEX IF NOT EXISTS email_delivery_log_provider_id_idx
  ON public.email_delivery_log(provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_delivery_log_campaign_stream_status_idx
  ON public.email_delivery_log(campaign_id, stream, status, sent_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_contacts_company_email_active_idx
  ON public.marketing_contacts(company_id, lower(email))
  WHERE email IS NOT NULL AND COALESCE(email_unsubscribed, false) = false;

-- ============================================================================
-- Persistent email outbox: retry, leasing, dead-letter
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  stream TEXT NOT NULL DEFAULT 'transactional'
    CHECK (stream IN ('marketing', 'transactional')),
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT,
  template_name TEXT,
  provider TEXT,
  sender_from TEXT,
  reply_to TEXT,
  provider_domain TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'dead', 'suppressed', 'canceled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  locked_by TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_idempotency_key_idx
  ON public.email_outbox(idempotency_key);

CREATE INDEX IF NOT EXISTS email_outbox_ready_idx
  ON public.email_outbox(status, scheduled_at, priority, created_at)
  WHERE status IN ('queued', 'failed', 'processing');

CREATE INDEX IF NOT EXISTS email_outbox_company_status_idx
  ON public.email_outbox(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS email_outbox_campaign_status_idx
  ON public.email_outbox(campaign_id, status, created_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  stream TEXT NOT NULL,
  campaign_id UUID,
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'dead',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS email_dead_letter_company_created_idx
  ON public.email_dead_letter(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_dead_letter_unresolved_idx
  ON public.email_dead_letter(company_id, created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_dead_letter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_outbox_select ON public.email_outbox;
CREATE POLICY email_outbox_select ON public.email_outbox
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS email_outbox_service_role_all ON public.email_outbox;
CREATE POLICY email_outbox_service_role_all ON public.email_outbox
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS email_dead_letter_select ON public.email_dead_letter;
CREATE POLICY email_dead_letter_select ON public.email_dead_letter
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS email_dead_letter_service_role_all ON public.email_dead_letter;
CREATE POLICY email_dead_letter_service_role_all ON public.email_dead_letter
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.email_outbox_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_outbox_touch ON public.email_outbox;
CREATE TRIGGER email_outbox_touch
  BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.email_outbox_touch_updated();

CREATE OR REPLACE FUNCTION public.claim_email_outbox_jobs(
  p_limit INTEGER DEFAULT 100,
  p_worker_id TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.email_outbox
    WHERE scheduled_at <= now()
      AND (
        status = 'queued'
        OR (status = 'failed' AND attempts < max_attempts)
        OR (status = 'processing' AND COALESCE(lease_until, '-infinity'::timestamptz) < now())
      )
    ORDER BY priority ASC, scheduled_at ASC, created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox e
  SET
    status = 'processing',
    attempts = e.attempts + 1,
    lease_until = now() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 3600))),
    locked_by = COALESCE(p_worker_id, 'email-worker'),
    updated_at = now()
  FROM picked
  WHERE e.id = picked.id
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox_jobs(INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox_jobs(INTEGER, TEXT, INTEGER) TO service_role;

COMMENT ON TABLE public.email_outbox IS
  'Outbox persistente email con idempotency key, lease worker, retry e dead-letter.';

COMMENT ON TABLE public.email_dead_letter IS
  'Archivio errori definitivi email dopo esaurimento retry o failure non recuperabile.';
