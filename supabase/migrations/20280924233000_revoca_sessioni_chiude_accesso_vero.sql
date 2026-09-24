-- Revoca delle sessioni: si chiude l'accesso vero, non solo la riga (24/09/2026)
--
-- Il difetto. «Revoca» — scheda utente → Sessioni, Impostazioni → Sicurezza,
-- /admin/utenti — segnava come terminata la riga di public.user_sessions e
-- basta. auth.sessions e auth.refresh_tokens restavano dov'erano: l'app
-- continuava a rinnovare il token e la persona restava dentro, mentre
-- l'amministratore vedeva «Terminata». Il 24/09 Venusia (BeMade) è stata
-- buttata fuori a mano con `delete from auth.sessions where user_id = …`, che è
-- quello che fa GoTrue per il logout globale: refresh token e fattori MFA se ne
-- vanno con l'ON DELETE CASCADE. Stesso difetto nel blocco del super admin,
-- che dichiarava «Bloccare senza chiudere le sessioni aperte non servirebbe a
-- nulla» e poi chiudeva solo le righe.
--
-- Il secondo difetto: le righe non erano sessioni. track-user-session ne apriva
-- una a ogni caricamento dell'app in una scheda nuova (l'id stava in
-- sessionStorage) e nessuna si chiudeva da sola: Venusia aveva 43 righe
-- «attive» per 3 accessi veri, in tutto 1.728 attive su 1.909. E nessuna riga
-- sapeva a quale accesso appartenesse, quindi non c'era modo di chiuderne uno.
--
-- Cosa cambia:
-- 1. user_sessions.auth_session_id: l'accesso (auth.sessions.id, claim
--    `session_id` del token) che la riga rappresenta. Una riga attiva per
--    accesso e azienda: le schede dello stesso browser condividono l'accesso,
--    quindi la riga.
-- 2. registra_sessione_app(): apre o riprende la riga dell'accesso, e non la
--    apre per un accesso che non esiste più — un token revocato vale fino alla
--    scadenza e senza questo controllo si riaprirebbe la riga da solo.
-- 3. chiudi_accessi_utente(): chiude l'accesso vero (uno o tutti) e segna le
--    righe nella stessa transazione. La usano revoke-user-session, la revoca e
--    il blocco del super admin.
-- 4. chiudi_sessioni_app_senza_accesso(), ogni 15 minuti: chiude le righe il
--    cui accesso non c'è più (uscita, revoca, «Esci» su un altro dispositivo,
--    che in supabase-js è globale). Le righe di prima di oggi, non collegate a
--    nessun accesso, si chiudono tutte tranne una per persona e azienda, e
--    quella resta finché la persona ha un accesso vivo che nessuna riga
--    rappresenta: chi è dentro non deve risultare fuori. Revocarla chiude
--    tutti i suoi accessi, perché non si sa quale dispositivo sia.
-- 5. Le righe le scrive solo il server: via la policy che lasciava a ognuno
--    inserire righe proprie e la parte di quella di modifica che gli lasciava
--    cambiarle. Nessun codice le usava, e cambiando auth_session_id una
--    persona avrebbe tolto il proprio dispositivo dall'elenco revocabile.
--
-- Cosa resta: il token di accesso già emesso vale fino alla scadenza, un'ora
-- (misurata sui rinnovi: mediana 58,7 minuti). PostgREST e le funzioni che
-- verificano il token in locale (ES256) non guardano auth.sessions. L'app
-- torna al login prima: useAccessoRevocato chiede a GoTrue, ogni due minuti e
-- al ritorno sulla scheda, se l'accesso c'è ancora.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Il legame fra la riga e l'accesso ────────────────────────────────────

ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS auth_session_id uuid;

COMMENT ON COLUMN public.user_sessions.auth_session_id IS
  'auth.sessions.id dell''accesso che la riga rappresenta (claim session_id del token). '
  'Senza chiave esterna: auth è di GoTrue, e la riga resta come storico quando l''accesso finisce.';

CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_accesso_attivo_uq
  ON public.user_sessions (auth_session_id, company_id)
  WHERE is_active AND auth_session_id IS NOT NULL;

-- ── 2. Aprire o riprendere la riga dell'accesso ─────────────────────────────

CREATE OR REPLACE FUNCTION public.registra_sessione_app(
  p_user_id uuid,
  p_company_id uuid,
  p_auth_session_id uuid,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_os text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Un token senza claim session_id: la riga si apre come prima e il giro
  -- periodico la tratta come quelle di prima di oggi.
  IF p_auth_session_id IS NULL THEN
    INSERT INTO public.user_sessions (user_id, company_id, ip_address, user_agent, device_type, browser, os)
    VALUES (p_user_id, p_company_id, p_ip_address, p_user_agent, p_device_type, p_browser, p_os)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- Accesso chiuso (revocato, bloccato, uscito): il suo token vale ancora fino
  -- alla scadenza, ma non deve riaprire una riga.
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions s
     WHERE s.id = p_auth_session_id AND s.user_id = p_user_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_sessions AS us
    (user_id, company_id, auth_session_id, ip_address, user_agent, device_type, browser, os)
  VALUES
    (p_user_id, p_company_id, p_auth_session_id, p_ip_address, p_user_agent, p_device_type, p_browser, p_os)
  ON CONFLICT (auth_session_id, company_id) WHERE is_active AND auth_session_id IS NOT NULL
  DO UPDATE SET last_active_at = now()
    WHERE us.user_id = EXCLUDED.user_id
  RETURNING us.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registra_sessione_app(uuid, uuid, uuid, inet, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_sessione_app(uuid, uuid, uuid, inet, text, text, text, text)
  TO service_role;

-- ── 3. Chiudere l'accesso vero ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chiudi_accessi_utente(
  p_user_id uuid,
  p_auth_session_id uuid DEFAULT NULL,  -- NULL: tutti i dispositivi (logout globale)
  p_company_id uuid DEFAULT NULL,       -- limita le righe segnate, non l'accesso
  p_revocata_da uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_accessi integer;
  v_righe integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'chiudi_accessi_utente: utente mancante' USING ERRCODE = '22004';
  END IF;

  -- Come il logout di GoTrue: refresh token e fattori MFA vanno a cascata.
  DELETE FROM auth.sessions
   WHERE user_id = p_user_id
     AND (p_auth_session_id IS NULL OR id = p_auth_session_id);
  GET DIAGNOSTICS v_accessi = ROW_COUNT;

  UPDATE public.user_sessions
     SET is_active = false,
         ended_at = now(),
         revoked_by = p_revocata_da,
         revoke_reason = COALESCE(p_motivo, 'Revocata')
   WHERE user_id = p_user_id
     AND is_active
     AND (p_auth_session_id IS NULL OR auth_session_id = p_auth_session_id)
     AND (p_company_id IS NULL OR company_id = p_company_id);
  GET DIAGNOSTICS v_righe = ROW_COUNT;

  RETURN jsonb_build_object('accessi_chiusi', v_accessi, 'righe_chiuse', v_righe);
END;
$$;

REVOKE ALL ON FUNCTION public.chiudi_accessi_utente(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chiudi_accessi_utente(uuid, uuid, uuid, uuid, text)
  TO service_role;

-- ── 4. Righe rimaste «attive» senza accesso ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.chiudi_sessioni_app_senza_accesso()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_collegate integer;
  v_non_collegate integer;
BEGIN
  -- Righe di un accesso che non c'è più.
  UPDATE public.user_sessions us
     SET is_active = false,
         ended_at = now()
   WHERE us.is_active
     AND us.auth_session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = us.auth_session_id);
  GET DIAGNOSTICS v_collegate = ROW_COUNT;

  -- Righe non collegate a un accesso: ne resta una per persona e azienda, e
  -- solo finché la persona ha un accesso vivo che nessuna riga rappresenta.
  UPDATE public.user_sessions us
     SET is_active = false,
         ended_at = now(),
         revoke_reason = COALESCE(us.revoke_reason, 'Chiusa d''ufficio: non collegata a un accesso')
   WHERE us.is_active
     AND us.auth_session_id IS NULL
     AND (
       NOT EXISTS (
         SELECT 1 FROM auth.sessions s
          WHERE s.user_id = us.user_id
            AND NOT EXISTS (
              SELECT 1 FROM public.user_sessions r
               WHERE r.auth_session_id = s.id AND r.is_active
            )
       )
       OR EXISTS (
         SELECT 1 FROM public.user_sessions n
          WHERE n.user_id = us.user_id
            AND n.company_id = us.company_id
            AND n.is_active
            AND n.auth_session_id IS NULL
            AND (n.started_at, n.id) > (us.started_at, us.id)
       )
     );
  GET DIAGNOSTICS v_non_collegate = ROW_COUNT;

  RETURN v_collegate + v_non_collegate;
END;
$$;

REVOKE ALL ON FUNCTION public.chiudi_sessioni_app_senza_accesso()
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'chiudi-sessioni-app-senza-accesso';
END $$;

-- Solo SQL, niente pg_net: pochi millisecondi. Minuti dispari, lontano dai
-- gruppi a :03/:08 e dai quarti d'ora.
SELECT cron.schedule(
  'chiudi-sessioni-app-senza-accesso',
  '7-59/15 * * * *',
  'SELECT public.chiudi_sessioni_app_senza_accesso()'
);

-- ── 5. Super admin: revoca e blocco chiudono l'accesso vero ──────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(
  p_user_id uuid,
  p_session_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT 'Revocata dall''amministratore'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_accesso uuid;
  v_esito jsonb;
BEGIN
  IF NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  -- Una sessione sola: si chiude il suo accesso. Una riga non collegata a un
  -- accesso non dice quale dispositivo sia, e si chiudono tutti: meglio uno di
  -- troppo che uno che resta dentro.
  IF p_session_id IS NOT NULL THEN
    SELECT us.auth_session_id INTO v_accesso
      FROM public.user_sessions us
     WHERE us.id = p_session_id AND us.user_id = p_user_id AND us.is_active;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'sessioni_revocate', 0, 'accessi_chiusi', 0);
    END IF;
  END IF;

  v_esito := public.chiudi_accessi_utente(p_user_id, v_accesso, NULL, v_actor, p_reason);

  INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
  VALUES (v_actor, 'revoke_sessions', 'user', p_user_id::text,
          jsonb_build_object('sessioni_revocate', v_esito->'righe_chiuse',
                             'accessi_chiusi', v_esito->'accessi_chiusi',
                             'sessione_singola', p_session_id,
                             'tutti_i_dispositivi', v_accesso IS NULL,
                             'reason', p_reason));

  RETURN jsonb_build_object('ok', true,
                            'sessioni_revocate', v_esito->'righe_chiuse',
                            'accessi_chiusi', v_esito->'accessi_chiusi',
                            'tutti_i_dispositivi', v_accesso IS NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_target RECORD;
  v_sessioni integer := 0;
  v_accessi integer := 0;
  v_esito jsonb;
BEGIN
  IF NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  SELECT id, email, is_blocked INTO v_target FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Utente non trovato');
  END IF;

  -- Un amministratore non può bloccare se stesso: si chiuderebbe fuori.
  IF p_blocked AND p_user_id = v_actor THEN
    RETURN jsonb_build_object('error', 'Non puoi bloccare il tuo stesso account');
  END IF;

  UPDATE public.profiles
     SET is_blocked   = p_blocked,
         blocked_at   = CASE WHEN p_blocked THEN now() ELSE NULL END,
         blocked_by   = CASE WHEN p_blocked THEN v_actor ELSE NULL END,
         block_reason = CASE WHEN p_blocked THEN p_reason ELSE NULL END,
         -- Sbloccare azzera anche il blocco automatico da tentativi falliti.
         locked_until       = CASE WHEN p_blocked THEN locked_until ELSE NULL END,
         failed_login_count = CASE WHEN p_blocked THEN failed_login_count ELSE 0 END
   WHERE id = p_user_id;

  -- Bloccare senza chiudere le sessioni aperte non servirebbe a nulla: si
  -- chiudono gli accessi veri, non solo le righe dell'elenco.
  IF p_blocked THEN
    v_esito := public.chiudi_accessi_utente(p_user_id, NULL, NULL, v_actor, COALESCE(p_reason, 'Account bloccato'));
    v_sessioni := (v_esito->>'righe_chiuse')::integer;
    v_accessi := (v_esito->>'accessi_chiusi')::integer;
  END IF;

  INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
  VALUES (v_actor, CASE WHEN p_blocked THEN 'block_user' ELSE 'unblock_user' END,
          'user', p_user_id::text,
          jsonb_build_object('target_email', v_target.email, 'reason', p_reason,
                             'sessioni_chiuse', v_sessioni, 'accessi_chiusi', v_accessi));

  RETURN jsonb_build_object('ok', true, 'bloccato', p_blocked,
                            'sessioni_chiuse', v_sessioni, 'accessi_chiusi', v_accessi);
END;
$function$;

-- ── 6. Le righe le scrive solo il server ────────────────────────────────────

DROP POLICY IF EXISTS user_sessions_insert_self ON public.user_sessions;

DROP POLICY IF EXISTS user_sessions_update_admin ON public.user_sessions;
CREATE POLICY user_sessions_update_admin ON public.user_sessions
  FOR UPDATE
  USING (
    (
      (company_id = (SELECT public.get_my_company_id())
        AND (SELECT public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role)))
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

-- ── 7. Le righe di oggi ──────────────────────────────────────────────────────
-- 1.728 attive, nessuna collegata: chiuse le 40 di chi non ha più un accesso e
-- i 1.628 doppioni; restano 60 righe, una per persona e azienda, per le 59
-- persone che un accesso ce l'hanno ancora (conti del 24/09, prova a vuoto).

SELECT public.chiudi_sessioni_app_senza_accesso();
