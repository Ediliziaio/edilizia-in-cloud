-- ──────────────────────────────────────────────────────────────────────────
-- apply-email-signature.sql
--
-- Versione "pronta da incollare in Supabase Studio SQL Editor"
-- della migration 20270527050000_email_account_signature.sql
--
-- Aggiunge alla tabella `email_oauth_connections` 2 colonne nullable
-- (signature_html, signature_text) usate dal compose email inline
-- per auto-appendere la firma personale dell'utente.
--
-- Idempotente — può essere eseguita più volte senza errore.
--
-- Verifica post-run: incolla in fondo la query di check.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.email_oauth_connections
  ADD COLUMN IF NOT EXISTS signature_html text NULL,
  ADD COLUMN IF NOT EXISTS signature_text text NULL;

COMMENT ON COLUMN public.email_oauth_connections.signature_html IS
  'Firma HTML personale dell''utente per questo account. Appesa automaticamente al body delle email inviate. NULL = nessuna firma.';

COMMENT ON COLUMN public.email_oauth_connections.signature_text IS
  'Versione plain-text della firma. Se NULL ma signature_html è settato, viene generata stripping degli HTML tags.';

DROP VIEW IF EXISTS public.v_email_oauth_connections_meta CASCADE;

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
  c.signature_html,
  c.signature_text,
  CASE WHEN c.password_enc IS NOT NULL THEN '••••••••' ELSE NULL END AS password_masked
FROM public.email_oauth_connections c
WHERE user_id = auth.uid();

GRANT SELECT ON public.v_email_oauth_connections_meta TO authenticated;

COMMENT ON VIEW public.v_email_oauth_connections_meta IS
  'View security-invoker: espone metadati account email + firma (no token). Filtrato per auth.uid(). Aggiunto signature_html/signature_text 2026-05-27.';

COMMIT;

-- ── VERIFICA POST-RUN (deve restituire 2 righe TRUE) ──
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_oauth_connections'
      AND column_name = 'signature_html'
  ) AS signature_html_ok,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_oauth_connections'
      AND column_name = 'signature_text'
  ) AS signature_text_ok,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v_email_oauth_connections_meta'
      AND column_name = 'signature_html'
  ) AS view_exposes_signature;
