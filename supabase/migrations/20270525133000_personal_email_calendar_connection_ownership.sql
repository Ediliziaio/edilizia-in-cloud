-- Personal ownership for email and calendar connections.
-- A connected mailbox/calendar belongs to the user who connected it.
-- The same mailbox can be connected by multiple users as separate rows.

BEGIN;

-- Email OAuth/IMAP connections: old uniqueness was company-wide and would
-- overwrite the owner when a second user connected the same address.
DROP INDEX IF EXISTS public.idx_email_oauth_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_oauth_unique_personal
  ON public.email_oauth_connections (company_id, user_id, provider, lower(email_address))
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_oauth_unique_legacy_company
  ON public.email_oauth_connections (company_id, provider, lower(email_address))
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_oauth_owner_status
  ON public.email_oauth_connections (user_id, company_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS email_oauth_company_read_meta ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_company_admin_manage ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_meta_read ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_owner_manage ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_meta_read_personal ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_owner_manage_personal ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_super_admin ON public.email_oauth_connections;

CREATE POLICY email_oauth_meta_read_personal
  ON public.email_oauth_connections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY email_oauth_owner_manage_personal
  ON public.email_oauth_connections
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS email_oauth_service_all ON public.email_oauth_connections;
CREATE POLICY email_oauth_service_all
  ON public.email_oauth_connections
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE VIEW public.v_email_oauth_connections_meta
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.company_id,
  c.user_id,
  c.provider,
  c.email_address,
  c.status,
  c.last_synced_at,
  c.last_sync_error,
  c.consecutive_errors,
  c.emails_fetched_total,
  c.poll_enabled,
  c.poll_interval_minutes,
  c.sync_from_date,
  c.expires_at,
  c.created_at,
  c.updated_at,
  c.imap_host,
  c.imap_port,
  c.imap_secure,
  c.imap_username,
  c.smtp_host,
  c.smtp_port,
  c.smtp_secure,
  c.provider_label,
  c.last_test_ok,
  c.last_test_at,
  c.last_test_error,
  CASE WHEN c.password_enc IS NOT NULL THEN '••••••••' ELSE NULL END AS password_masked
FROM public.email_oauth_connections c
WHERE user_id = auth.uid();

GRANT SELECT ON public.v_email_oauth_connections_meta TO authenticated;

CREATE OR REPLACE FUNCTION public.email_oauth_upsert_connection(
  p_company_id uuid,
  p_user_id uuid,
  p_provider text,
  p_email_address text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_scopes text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    UPDATE public.email_oauth_connections
    SET
      access_token_enc = public.email_oauth_encrypt_token(p_access_token),
      refresh_token_enc = COALESCE(public.email_oauth_encrypt_token(p_refresh_token), refresh_token_enc),
      expires_at = p_expires_at,
      scopes = p_scopes,
      status = 'active',
      last_sync_error = NULL,
      consecutive_errors = 0
    WHERE company_id = p_company_id
      AND user_id IS NULL
      AND provider = p_provider
      AND lower(email_address) = lower(p_email_address)
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      INSERT INTO public.email_oauth_connections (
        company_id, user_id, provider, email_address,
        access_token_enc, refresh_token_enc, expires_at, scopes,
        status, last_sync_error, consecutive_errors
      ) VALUES (
        p_company_id, NULL, p_provider, lower(p_email_address),
        public.email_oauth_encrypt_token(p_access_token),
        public.email_oauth_encrypt_token(p_refresh_token),
        p_expires_at, p_scopes,
        'active', NULL, 0
      )
      RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
  END IF;

  INSERT INTO public.email_oauth_connections (
    company_id, user_id, provider, email_address,
    access_token_enc, refresh_token_enc, expires_at, scopes,
    status, last_sync_error, consecutive_errors
  ) VALUES (
    p_company_id, p_user_id, p_provider, lower(p_email_address),
    public.email_oauth_encrypt_token(p_access_token),
    public.email_oauth_encrypt_token(p_refresh_token),
    p_expires_at, p_scopes,
    'active', NULL, 0
  )
  ON CONFLICT (company_id, user_id, provider, lower(email_address))
  WHERE user_id IS NOT NULL
  DO UPDATE SET
    access_token_enc = EXCLUDED.access_token_enc,
    refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, email_oauth_connections.refresh_token_enc),
    expires_at = EXCLUDED.expires_at,
    scopes = EXCLUDED.scopes,
    status = 'active',
    last_sync_error = NULL,
    consecutive_errors = 0
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.email_oauth_upsert_connection(uuid, uuid, text, text, text, text, timestamptz, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_oauth_upsert_connection(uuid, uuid, text, text, text, text, timestamptz, text[]) TO service_role;

-- Calendar connections/settings are personal in the UI and RLS too.
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own google connection" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "Super admins full access google connections" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_own" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_insert_own" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_update_own" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_delete_own" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_select_personal" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_insert_personal" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_update_personal" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcal_conn_delete_personal" ON public.google_calendar_connections;

CREATE POLICY "gcal_conn_select_personal"
  ON public.google_calendar_connections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "gcal_conn_insert_personal"
  ON public.google_calendar_connections
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "gcal_conn_update_personal"
  ON public.google_calendar_connections
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "gcal_conn_delete_personal"
  ON public.google_calendar_connections
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.google_calendar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gcal_settings_own" ON public.google_calendar_settings;
DROP POLICY IF EXISTS "gcal_settings_upsert_own" ON public.google_calendar_settings;
DROP POLICY IF EXISTS "gcal_settings_select_personal" ON public.google_calendar_settings;
DROP POLICY IF EXISTS "gcal_settings_manage_personal" ON public.google_calendar_settings;

CREATE POLICY "gcal_settings_select_personal"
  ON public.google_calendar_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "gcal_settings_manage_personal"
  ON public.google_calendar_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.apple_calendar_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own apple connections" ON public.apple_calendar_connections;
DROP POLICY IF EXISTS "apple_calendar_connections_personal" ON public.apple_calendar_connections;

CREATE POLICY "apple_calendar_connections_personal"
  ON public.apple_calendar_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.apple_calendar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own apple settings" ON public.apple_calendar_settings;
DROP POLICY IF EXISTS "apple_calendar_settings_personal" ON public.apple_calendar_settings;

CREATE POLICY "apple_calendar_settings_personal"
  ON public.apple_calendar_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
