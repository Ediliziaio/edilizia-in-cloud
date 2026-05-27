-- ──────────────────────────────────────────────────────────────────────────
-- email_account_signature — firma per ogni account email collegato dall'utente.
--
-- 2026-05-27 (richiesta utente "ricordami la firma nella email se impostata"):
-- Prima esisteva solo `platform_email_signature` (firma EiC globale per email
-- transazionali sistema). Per le email inviate dall'utente dalle pagine
-- Cliente/Contatto/Email serviva una firma PERSONALE per account.
--
-- Soluzione: 2 colonne nullable su `email_oauth_connections`:
--   signature_html  → snippet HTML appeso al body delle email in invio
--   signature_text  → versione plain-text per i client che non rendono HTML
--
-- Auto-append nel compose:
--   body_final = body_user + "\n\n--\n" + signature_text
--   html_final = html_user + "<br/>--<br/>" + signature_html
-- (separator "--" è standard email RFC 3676 sig delimiter)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.email_oauth_connections
  ADD COLUMN IF NOT EXISTS signature_html text NULL,
  ADD COLUMN IF NOT EXISTS signature_text text NULL;

COMMENT ON COLUMN public.email_oauth_connections.signature_html IS
  'Firma HTML personale dell''utente per questo account. Appesa automaticamente al body delle email inviate. NULL = nessuna firma.';

COMMENT ON COLUMN public.email_oauth_connections.signature_text IS
  'Versione plain-text della firma. Se NULL ma signature_html è settato, viene generata stripping degli HTML tags.';

-- Aggiorno la view v_email_oauth_connections_meta per esporre i nuovi campi
-- senza esporre token segreti. Drop e ricreo per matchare il pattern usato
-- nelle migration precedenti.
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

-- RLS già definita su email_oauth_connections (owner-only).
-- L'UPDATE da parte dell'utente per la propria firma è già coperto dalla
-- policy esistente che permette UPDATE quando user_id = auth.uid().
-- Niente nuova policy necessaria.

COMMENT ON VIEW public.v_email_oauth_connections_meta IS
  'View security-invoker: espone metadati account email + firma (no token). Filtrato per auth.uid(). Aggiunto signature_html/signature_text 2026-05-27.';
