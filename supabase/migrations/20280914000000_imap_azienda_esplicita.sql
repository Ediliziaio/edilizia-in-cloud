-- Collegare una casella IMAP non funzionava per nessuno. L'errore visibile era
-- «Profilo senza azienda» in area super admin, ma dietro ce n'erano altri due.
--
-- 1. L'AZIENDA. `email_imap_upsert_connection` la ricavava da
--    `profiles.company_id`, che per un super admin è NULL: nel pannello di
--    piattaforma l'azienda non sta nel profilo, la porta il contesto
--    (PlatformCompanyProvider → 00000000-0000-0000-0000-000000000001). Gmail e
--    Outlook non avevano il problema perché la pagina passa già l'azienda a
--    `email-oauth-start`, che la verifica. Ora l'azienda arriva come parametro e
--    viene controllata con `user_can_access_company` (l'equivalente SQL di quel
--    controllo); se manca si torna al profilo, e per un super admin senza
--    azienda all'azienda di piattaforma, così anche un browser con il bundle
--    vecchio in cache smette di sbattere contro l'errore.
--
-- 2. LA CIFRATURA. Le password si cifravano con `pgsodium.crypto_secretbox`:
--    pgsodium è stata dismessa da Supabase e su questo progetto non c'è più
--    (nessuna estensione, nessuna funzione). Qualunque salvataggio moriva su
--    `gen_random_bytes`, e la lettura delle credenziali — quella che serve al
--    polling della posta e all'invio SMTP — sarebbe morta subito dopo. Non
--    c'erano dati da convertire: l'unica riga IMAP in tabella è quella della
--    demo, senza password. Ora si usa pgcrypto (`pgp_sym_encrypt`, che il salt
--    se lo mette da solo) con una chiave che vive nel Vault, come i segreti dei
--    cron.
--
-- 3. IL DOPPIO SALVATAGGIO. La coppia (azienda, utente, provider, indirizzo) è
--    unica: la stessa casella salvata due volte rispondeva «duplicate key».
--    Adesso la funzione fa l'upsert che il nome promette.

-- La chiave sta nel Vault, non in questo file: il valore lo genera il database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'imap_password_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'imap_password_key',
      'Chiave con cui si cifrano le password delle caselle IMAP/SMTP collegate'
    );
  END IF;
END $$;

-- Solo le due funzioni qui sotto la leggono, e girano come proprietario:
-- nessun ruolo dell'applicazione ha il permesso di eseguirla.
CREATE OR REPLACE FUNCTION public.email_imap_chiave()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.decrypted_secret
    FROM vault.decrypted_secrets s
   WHERE s.name = 'imap_password_key'
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.email_imap_chiave() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.email_imap_upsert_connection(
  text, text, integer, boolean, text, text, integer, boolean, text, text, uuid
);

CREATE OR REPLACE FUNCTION public.email_imap_upsert_connection(
  p_email_address text,
  p_imap_host text,
  p_imap_port integer,
  p_imap_secure boolean,
  p_imap_username text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_secure boolean,
  p_password text,
  p_provider_label text DEFAULT 'custom'::text,
  p_existing_id uuid DEFAULT NULL::uuid,
  p_company_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_id UUID;
  v_chiave TEXT;
  v_password_enc BYTEA;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NOT NULL THEN
    IF NOT public.user_can_access_company(p_company_id) THEN
      RAISE EXCEPTION 'Permesso negato su questa azienda' USING ERRCODE = '42501';
    END IF;
    v_company_id := p_company_id;
  ELSE
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_user_id;
    IF v_company_id IS NULL
       AND public.has_role(v_user_id, 'super_admin'::public.app_role) THEN
      SELECT id INTO v_company_id
        FROM public.companies
       WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna azienda a cui collegare la casella' USING ERRCODE = '42501';
  END IF;

  IF p_password IS NOT NULL AND length(p_password) > 0 THEN
    v_chiave := public.email_imap_chiave();
    IF v_chiave IS NULL THEN
      RAISE EXCEPTION 'Chiave di cifratura non configurata' USING ERRCODE = '55000';
    END IF;
    v_password_enc := extensions.pgp_sym_encrypt(p_password, v_chiave);
  END IF;

  -- Riaggancio alla riga già esistente: la coppia (azienda, utente, provider,
  -- indirizzo) è unica, quindi un secondo salvataggio deve aggiornare.
  v_id := p_existing_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.email_oauth_connections
     WHERE company_id = v_company_id
       AND user_id = v_user_id
       AND provider = 'imap'
       AND lower(email_address) = lower(p_email_address)
     LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.email_oauth_connections
    SET
      email_address      = lower(p_email_address),
      imap_host          = p_imap_host,
      imap_port          = p_imap_port,
      imap_secure        = p_imap_secure,
      imap_username      = COALESCE(p_imap_username, p_email_address),
      smtp_host          = p_smtp_host,
      smtp_port          = p_smtp_port,
      smtp_secure        = p_smtp_secure,
      password_enc       = COALESCE(v_password_enc, password_enc),
      password_nonce     = NULL,
      provider_label     = COALESCE(p_provider_label, provider_label),
      status             = 'active',
      last_sync_error    = NULL,
      consecutive_errors = 0,
      updated_at         = now()
    WHERE id = v_id AND user_id = v_user_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Casella non trovata o non tua' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_password_enc IS NULL THEN
      RAISE EXCEPTION 'Password IMAP richiesta' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.email_oauth_connections (
      company_id, user_id, provider, email_address,
      imap_host, imap_port, imap_secure, imap_username,
      smtp_host, smtp_port, smtp_secure, password_enc, password_nonce,
      provider_label, status, scopes
    )
    VALUES (
      v_company_id, v_user_id, 'imap', lower(p_email_address),
      p_imap_host, p_imap_port, p_imap_secure, COALESCE(p_imap_username, p_email_address),
      p_smtp_host, p_smtp_port, p_smtp_secure, v_password_enc, NULL,
      COALESCE(p_provider_label, 'custom'),
      'active',
      '{}'::text[]
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_imap_upsert_connection(
  text, text, integer, boolean, text, text, integer, boolean, text, text, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.email_imap_upsert_connection(
  text, text, integer, boolean, text, text, integer, boolean, text, text, uuid, uuid
) TO authenticated, service_role;

-- Dall'altra parte: chi manda e riceve la posta rilegge la password con la
-- stessa chiave. Resta riservata al service_role (edge function).
CREATE OR REPLACE FUNCTION public.email_imap_get_credentials(p_connection_id uuid)
RETURNS TABLE(
  email_address text, imap_host text, imap_port integer, imap_secure boolean,
  imap_username text, smtp_host text, smtp_port integer, smtp_secure boolean,
  password text, company_id uuid, user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_chiave TEXT;
BEGIN
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role' USING ERRCODE = '42501';
  END IF;

  v_chiave := public.email_imap_chiave();
  IF v_chiave IS NULL THEN
    RAISE EXCEPTION 'Chiave di cifratura non configurata' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY
  SELECT
    c.email_address,
    c.imap_host, c.imap_port, c.imap_secure, c.imap_username,
    c.smtp_host, c.smtp_port, c.smtp_secure,
    extensions.pgp_sym_decrypt(c.password_enc, v_chiave),
    c.company_id, c.user_id
  FROM public.email_oauth_connections c
  WHERE c.id = p_connection_id
    AND c.provider = 'imap'
    AND c.password_enc IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_imap_get_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_imap_get_credentials(uuid) TO authenticated, service_role;
