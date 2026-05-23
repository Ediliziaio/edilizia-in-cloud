-- Hardening client email personale: privacy per utente, sync provider e IMAP più sicuro.
BEGIN;

-- Colonne provider/folder per gestire Gmail, Outlook e IMAP come mailbox personale.
ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS mailbox_folder TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS cc_emails TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bcc_emails TEXT[] DEFAULT '{}';

ALTER TABLE public.email_inbox
  DROP CONSTRAINT IF EXISTS email_inbox_mailbox_folder_check;
ALTER TABLE public.email_inbox
  ADD CONSTRAINT email_inbox_mailbox_folder_check
  CHECK (mailbox_folder IN ('inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'));

ALTER TABLE public.email_inbox
  DROP CONSTRAINT IF EXISTS email_inbox_ai_category_check;
ALTER TABLE public.email_inbox
  ADD CONSTRAINT email_inbox_ai_category_check
  CHECK (ai_category IN (
    'lead',
    'preventivo',
    'cliente_esistente',
    'fornitore',
    'fattura',
    'pratica_amministrativa',
    'support',
    'spam',
    'altro',
    'pending'
  ));

-- Il vecchio indice (company_id, message_id) bloccava lo stesso Message-ID su più utenti.
DROP INDEX IF EXISTS public.idx_email_inbox_message_id;

-- Gli indici unici vengono creati solo se lo storico è già pulito: la migration non deve
-- bloccarsi su vecchie email duplicate importate prima dell'isolamento personale.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT company_id, user_id, message_id, count(*) AS n
      FROM public.email_inbox
      WHERE user_id IS NOT NULL AND message_id IS NOT NULL
      GROUP BY company_id, user_id, message_id
      HAVING count(*) > 1
    ) dup
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_personal_message_id ON public.email_inbox(company_id, user_id, message_id) WHERE user_id IS NOT NULL AND message_id IS NOT NULL';
  ELSE
    RAISE NOTICE 'email_inbox contiene duplicati personali: creato indice non univoco, deduplicare prima di attivare vincolo unico.';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_inbox_personal_message_id_nonunique ON public.email_inbox(company_id, user_id, message_id) WHERE user_id IS NOT NULL AND message_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT company_id, message_id, count(*) AS n
      FROM public.email_inbox
      WHERE user_id IS NULL AND message_id IS NOT NULL
      GROUP BY company_id, message_id
      HAVING count(*) > 1
    ) dup
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_legacy_company_message_id ON public.email_inbox(company_id, message_id) WHERE user_id IS NULL AND message_id IS NOT NULL';
  ELSE
    RAISE NOTICE 'email_inbox legacy contiene duplicati aziendali: creato indice non univoco, deduplicare prima di attivare vincolo unico.';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_inbox_legacy_company_message_id_nonunique ON public.email_inbox(company_id, message_id) WHERE user_id IS NULL AND message_id IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_folder_received
  ON public.email_inbox(user_id, mailbox_folder, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_inbox_oauth_received
  ON public.email_inbox(oauth_connection_id, received_at DESC)
  WHERE oauth_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_inbox_provider_message
  ON public.email_inbox(oauth_connection_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_inbox_user_ai_category_received
  ON public.email_inbox(user_id, ai_category, received_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_inbox_user_ai_priority_received
  ON public.email_inbox(user_id, ai_priority, received_at DESC)
  WHERE user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT company_id, user_id, folder_type, count(*) AS n
      FROM public.email_folders
      WHERE user_id IS NOT NULL
        AND folder_type IN ('inbox', 'sent', 'drafts', 'important', 'spam', 'trash')
      GROUP BY company_id, user_id, folder_type
      HAVING count(*) > 1
    ) dup
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_folders_user_system_type ON public.email_folders(company_id, user_id, folder_type) WHERE user_id IS NOT NULL AND folder_type IN (''inbox'', ''sent'', ''drafts'', ''important'', ''spam'', ''trash'')';
  ELSE
    RAISE NOTICE 'email_folders contiene cartelle system duplicate: creato indice non univoco, deduplicare prima di attivare vincolo unico.';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_folders_user_system_type_nonunique ON public.email_folders(company_id, user_id, folder_type) WHERE user_id IS NOT NULL AND folder_type IN (''inbox'', ''sent'', ''drafts'', ''important'', ''spam'', ''trash'')';
  END IF;
END $$;

-- RLS inbox: rimuove le policy company-wide legacy, che bypassavano l'isolamento personale.
DROP POLICY IF EXISTS email_inbox_company_read ON public.email_inbox;
DROP POLICY IF EXISTS email_inbox_company_update ON public.email_inbox;

DROP POLICY IF EXISTS "email_inbox_select" ON public.email_inbox;
CREATE POLICY "email_inbox_select" ON public.email_inbox
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND company_id = public.get_my_company_id()
      AND (public.is_super_admin() OR public.has_role(auth.uid(), 'company_admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS "email_inbox_update" ON public.email_inbox;
CREATE POLICY "email_inbox_update" ON public.email_inbox
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "email_inbox_delete" ON public.email_inbox;
CREATE POLICY "email_inbox_delete" ON public.email_inbox
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "email_inbox_service" ON public.email_inbox;
CREATE POLICY "email_inbox_service" ON public.email_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Connessioni email: un utente può gestire la propria casella personale; admin vede/gestisce quelle aziendali.
DROP POLICY IF EXISTS email_oauth_company_read_meta ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_company_admin_manage ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_owner_manage ON public.email_oauth_connections;
DROP POLICY IF EXISTS email_oauth_meta_read ON public.email_oauth_connections;

CREATE POLICY email_oauth_meta_read ON public.email_oauth_connections
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      company_id = public.get_effective_company_id()
      AND (public.is_super_admin() OR public.has_role(auth.uid(), 'company_admin'::public.app_role))
    )
  );

CREATE POLICY email_oauth_owner_manage ON public.email_oauth_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_effective_company_id())
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_effective_company_id());

CREATE POLICY email_oauth_company_admin_manage ON public.email_oauth_connections
  FOR ALL TO authenticated
  USING (
    company_id = public.get_effective_company_id()
    AND (public.is_super_admin() OR public.has_role(auth.uid(), 'company_admin'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_effective_company_id()
    AND (public.is_super_admin() OR public.has_role(auth.uid(), 'company_admin'::public.app_role))
  );

-- View personale: mantiene l'ordine colonne esistente e aggiunge metadati in coda.
CREATE OR REPLACE VIEW public.v_my_email_inbox AS
SELECT
  i.id,
  i.company_id,
  i.user_id,
  i.thread_id,
  i.folder_id,
  i.message_id,
  i.in_reply_to,
  i.from_email,
  i.from_name,
  i.to_email,
  i.subject,
  i.received_at,
  i.ai_category,
  i.ai_priority,
  i.ai_summary,
  i.attachments,
  i.is_read,
  i.is_starred,
  i.is_archived,
  i.is_trashed,
  CASE
    WHEN i.raw_text IS NOT NULL THEN LEFT(i.raw_text, 200)
    ELSE NULL
  END AS preview,
  i.oauth_connection_id,
  i.status,
  i.provider_message_id,
  i.provider_thread_id,
  i.mailbox_folder,
  i.cc_emails,
  i.bcc_emails
FROM public.email_inbox i
WHERE i.user_id = auth.uid();

GRANT SELECT ON public.v_my_email_inbox TO authenticated;

CREATE OR REPLACE VIEW public.v_my_email_threads AS
SELECT
  t.id,
  t.user_id,
  t.company_id,
  t.subject_normalized,
  t.participants,
  t.message_count,
  t.unread_count,
  t.has_starred,
  t.has_attachments,
  t.first_received_at,
  t.last_received_at,
  t.preview,
  (
    SELECT subject FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
    ORDER BY received_at DESC LIMIT 1
  ) AS last_subject,
  (
    SELECT from_email FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
    ORDER BY received_at DESC LIMIT 1
  ) AS last_from_email,
  (
    SELECT from_name FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
    ORDER BY received_at DESC LIMIT 1
  ) AS last_from_name,
  (
    SELECT array_remove(array_agg(DISTINCT oauth_connection_id), NULL)
    FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
  ) AS oauth_connection_ids,
  (
    SELECT array_remove(array_agg(DISTINCT mailbox_folder), NULL)
    FROM public.email_inbox
    WHERE thread_id = t.id AND user_id = t.user_id
  ) AS mailbox_folders
FROM public.email_threads t
WHERE t.user_id = auth.uid();

GRANT SELECT ON public.v_my_email_threads TO authenticated;

-- Preserve user_id durante refresh token: p_user_id NULL non deve più scollegare l'owner.
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
  ON CONFLICT (company_id, provider, lower(email_address)) DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, email_oauth_connections.user_id),
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

-- Aggiunge user_id alla RPC di decrypt per le edge function.
DROP FUNCTION IF EXISTS public.email_oauth_get_decrypted_tokens(uuid);
CREATE FUNCTION public.email_oauth_get_decrypted_tokens(p_connection_id uuid)
RETURNS TABLE (
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  provider text,
  email_address text,
  company_id uuid,
  user_id uuid,
  scopes text[],
  provider_metadata jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.email_oauth_decrypt_token(c.access_token_enc),
    public.email_oauth_decrypt_token(c.refresh_token_enc),
    c.expires_at, c.provider, c.email_address, c.company_id, c.user_id,
    c.scopes, c.provider_metadata
  FROM public.email_oauth_connections c
  WHERE c.id = p_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.email_oauth_get_decrypted_tokens(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_oauth_get_decrypted_tokens(uuid) TO service_role;

-- IMAP password: nuovo nonce casuale per ogni encryption; fallback zero nonce per righe legacy.
ALTER TABLE public.email_oauth_connections
  ADD COLUMN IF NOT EXISTS password_nonce BYTEA;

CREATE OR REPLACE FUNCTION public.email_imap_upsert_connection(
  p_email_address    TEXT,
  p_imap_host        TEXT,
  p_imap_port        INT,
  p_imap_secure      BOOLEAN,
  p_imap_username    TEXT,
  p_smtp_host        TEXT,
  p_smtp_port        INT,
  p_smtp_secure      BOOLEAN,
  p_password         TEXT,
  p_provider_label   TEXT DEFAULT 'custom',
  p_existing_id      UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_id UUID;
  v_nonce BYTEA;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Profilo senza azienda' USING ERRCODE = '42501';
  END IF;

  IF p_password IS NOT NULL AND length(p_password) > 0 THEN
    v_nonce := gen_random_bytes(24);
  END IF;

  IF p_existing_id IS NOT NULL THEN
    UPDATE public.email_oauth_connections
    SET
      email_address    = lower(p_email_address),
      imap_host        = p_imap_host,
      imap_port        = p_imap_port,
      imap_secure      = p_imap_secure,
      imap_username    = COALESCE(p_imap_username, p_email_address),
      smtp_host        = p_smtp_host,
      smtp_port        = p_smtp_port,
      smtp_secure      = p_smtp_secure,
      password_enc     = CASE
        WHEN v_nonce IS NOT NULL
        THEN pgsodium.crypto_secretbox(
          convert_to(p_password, 'UTF8'),
          v_nonce,
          (SELECT key_id FROM pgsodium.valid_key WHERE name = 'default' LIMIT 1)
        )
        ELSE password_enc
      END,
      password_nonce   = COALESCE(v_nonce, password_nonce),
      provider_label   = COALESCE(p_provider_label, provider_label),
      status           = 'active',
      updated_at       = now()
    WHERE id = p_existing_id AND user_id = v_user_id
    RETURNING id INTO v_id;
  ELSE
    IF v_nonce IS NULL THEN
      RAISE EXCEPTION 'Password IMAP richiesta' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.email_oauth_connections (
      company_id, user_id, provider, email_address,
      imap_host, imap_port, imap_secure, imap_username,
      smtp_host, smtp_port, smtp_secure,
      password_enc, password_nonce, provider_label, status, scopes
    )
    VALUES (
      v_company_id, v_user_id, 'imap', lower(p_email_address),
      p_imap_host, p_imap_port, p_imap_secure, COALESCE(p_imap_username, p_email_address),
      p_smtp_host, p_smtp_port, p_smtp_secure,
      pgsodium.crypto_secretbox(
        convert_to(p_password, 'UTF8'),
        v_nonce,
        (SELECT key_id FROM pgsodium.valid_key WHERE name = 'default' LIMIT 1)
      ),
      v_nonce,
      COALESCE(p_provider_label, 'custom'),
      'active',
      '{}'::text[]
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_imap_get_credentials(p_connection_id UUID)
RETURNS TABLE(
  email_address TEXT,
  imap_host TEXT, imap_port INT, imap_secure BOOLEAN, imap_username TEXT,
  smtp_host TEXT, smtp_port INT, smtp_secure BOOLEAN,
  password TEXT, company_id UUID, user_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
BEGIN
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.email_address,
    c.imap_host, c.imap_port, c.imap_secure, c.imap_username,
    c.smtp_host, c.smtp_port, c.smtp_secure,
    convert_from(
      pgsodium.crypto_secretbox_open(
        c.password_enc,
        COALESCE(c.password_nonce, decode(repeat('00', 24), 'hex')),
        (SELECT pgsodium.valid_key.key_id FROM pgsodium.valid_key WHERE pgsodium.valid_key.name = 'default' LIMIT 1)
      ),
      'UTF8'
    ),
    c.company_id, c.user_id
  FROM public.email_oauth_connections c
  WHERE c.id = p_connection_id
    AND c.provider = 'imap'
    AND c.password_enc IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_imap_record_test(
  p_connection_id UUID,
  p_ok            BOOLEAN,
  p_error         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_oauth_connections
  SET
    last_test_ok    = p_ok,
    last_test_at    = now(),
    last_test_error = p_error,
    status          = CASE WHEN p_ok THEN 'active' ELSE 'error' END
  WHERE id = p_connection_id
    AND (
      current_setting('role', true) = 'service_role'
      OR user_id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connessione non trovata o permesso negato' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.email_imap_record_test(UUID, BOOLEAN, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.email_imap_record_test(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

COMMIT;
