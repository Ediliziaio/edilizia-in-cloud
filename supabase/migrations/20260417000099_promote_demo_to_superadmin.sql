-- ────────────────────────────────────────────────────────────────────
-- Promozione dell'utente demo@azienda.srl a super_admin
-- Lo user è l'account dev principale e deve poter accedere al pannello
-- SuperAdmin (/admin/aziende/:id) per gestire piani, override feature,
-- crediti multi-wallet, audit log. Senza questo ruolo la tab Abbonamento
-- non è raggiungibile.
--
-- Idempotente: se il ruolo già esiste viene ignorato.
-- ────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('demo@azienda.srl')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Utente demo@azienda.srl non trovato in auth.users — skip';
    RETURN;
  END IF;

  -- Inserisce il ruolo super_admin se non esiste già
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin'::app_role)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'demo@azienda.srl promosso a super_admin (user_id=%)', v_user_id;
END $$;
