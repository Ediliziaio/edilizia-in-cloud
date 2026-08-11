-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.outreach_sender_accounts
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port integer,
  ADD COLUMN IF NOT EXISTS imap_secure boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_imap_uid text,
  ADD COLUMN IF NOT EXISTS last_imap_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS connection_error text,
  ADD COLUMN IF NOT EXISTS connection_checked_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.outreach_sender_accounts
    ADD CONSTRAINT outreach_sender_conn_status_chk
    CHECK (connection_status IN ('untested','ok','error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.outreach_mailbox_secret(p_ref text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = vault, public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_ref LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.outreach_mailbox_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_mailbox_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.outreach_mailbox_set_secret(p_name text, p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vault, public AS $$
DECLARE existing uuid;
BEGIN
  SELECT id INTO existing FROM vault.secrets WHERE name = p_name LIMIT 1;
  IF existing IS NULL THEN PERFORM vault.create_secret(p_secret, p_name);
  ELSE PERFORM vault.update_secret(existing, p_secret); END IF;
END $$;
REVOKE ALL ON FUNCTION public.outreach_mailbox_set_secret(text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_mailbox_set_secret(text,text) TO service_role;
