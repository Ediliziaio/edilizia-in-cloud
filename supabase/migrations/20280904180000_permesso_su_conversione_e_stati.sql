-- Ondata 2.3 — il permesso, non solo l'azienda, sulle azioni di stato
--
-- Verificato sul catalogo: NESSUNA fra create_order_atomic, change_order_status,
-- sr_converti_in_ordine e save_order_statuses chiamava has_permission.
-- Controllavano al più l'appartenenza all'azienda, quindi chi ha la sola
-- lettura poteva convertire un preventivo in commessa e cambiare stato alle
-- commesse altrui dentro la propria azienda.
--
-- E in create_order_atomic c'era di peggio:
--     v_caller_id := COALESCE(p_user_id, auth.uid());
-- L'identità arrivava dal PARAMETRO prima che da auth.uid(), e i controlli
-- venivano fatti su quella:
--     IF NOT (has_role(v_caller_id, 'super_admin') OR ...appartiene all'azienda)
-- Un utente autenticato qualunque poteva passare come p_user_id l'uuid di un
-- super_admin e superare il controllo. Non è un problema di attribuzione: è
-- un'elevazione di privilegi. Ora auth.uid() viene prima, e il parametro resta
-- solo per i percorsi senza sessione (cron, service role) — stessa regola
-- dell'attore dello storico.
--
-- change_order_status prendeva anche l'attore dal client (p_changed_by):
-- ora si usa auth.uid() quando c'è.

CREATE OR REPLACE FUNCTION public.assert_permesso(p_permesso text, p_azione text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Codice interno nostro (cron, edge col service role): non ha una sessione
  -- e non è un utente che si sta arrogando un permesso.
  IF v_uid IS NULL AND public.ai_is_service_role() THEN RETURN; END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Accesso negato: serve una sessione' USING ERRCODE = '42501';
  END IF;

  -- has_permission dice già di sì a super_admin e company_admin.
  IF NOT public.has_permission(v_uid, p_permesso) THEN
    -- In RAISE il segnaposto è '%', non '%s': con '%s' il valore prende il
    -- posto del '%' e la 's' resta attaccata ("can_edit_orderss").
    RAISE EXCEPTION 'Permesso mancante per %: serve "%"', p_azione, p_permesso
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_permesso(text, text) IS
  'Solleva se chi chiama non ha il permesso indicato. Il service role passa: è codice interno, non un utente.';

REVOKE ALL ON FUNCTION public.assert_permesso(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_permesso(text, text) TO authenticated, service_role;

-- ── Le tre funzioni, con sostituzioni testuali esatte prese dal catalogo ─────
-- Il resto di ognuna resta identico: non c'è nulla da ricopiare a mano, e
-- quindi nulla da sbagliare ricopiando.
DO $$
DECLARE
  v_def text; v_nuovo text; v_fatte text[] := '{}';
BEGIN
  -- 1. create_order_atomic
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic';

  v_nuovo := replace(v_def,
    'v_caller_id  := COALESCE(p_user_id, auth.uid());',
    'v_caller_id  := COALESCE(auth.uid(), p_user_id);');
  v_nuovo := replace(v_nuovo,
    E'RAISE EXCEPTION \'create_order_atomic: non autorizzato per la company %\', v_company_id;\n  END IF;',
    E'RAISE EXCEPTION \'create_order_atomic: non autorizzato per la company %\', v_company_id;\n  END IF;\n\n  PERFORM public.assert_permesso(\'can_edit_orders\', \'creare una commessa\');');

  IF v_nuovo IS DISTINCT FROM v_def THEN
    EXECUTE v_nuovo; v_fatte := v_fatte || 'create_order_atomic'::text;
  END IF;

  -- 2. change_order_status
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'change_order_status';

  v_nuovo := replace(v_def,
    E'RAISE EXCEPTION \'accesso negato: azienda non consentita\' USING ERRCODE = \'42501\';\n  END IF;',
    E'RAISE EXCEPTION \'accesso negato: azienda non consentita\' USING ERRCODE = \'42501\';\n  END IF;\n\n  PERFORM public.assert_permesso(\'can_edit_orders\', \'cambiare stato a una commessa\');');
  v_nuovo := replace(v_nuovo,
    'WHERE id = p_changed_by;',
    'WHERE id = COALESCE(auth.uid(), p_changed_by);');

  IF v_nuovo IS DISTINCT FROM v_def THEN
    EXECUTE v_nuovo; v_fatte := v_fatte || 'change_order_status'::text;
  END IF;

  -- 3. sr_converti_in_ordine
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sr_converti_in_ordine';

  v_nuovo := replace(v_def,
    E'RAISE EXCEPTION \'Progetto Serramenti non trovato o non accessibile\';\n  END IF;',
    E'RAISE EXCEPTION \'Progetto Serramenti non trovato o non accessibile\';\n  END IF;\n\n  PERFORM public.assert_permesso(\'can_edit_orders\', \'convertire un preventivo in commessa\');');

  IF v_nuovo IS DISTINCT FROM v_def THEN
    EXECUTE v_nuovo; v_fatte := v_fatte || 'sr_converti_in_ordine'::text;
  END IF;

  RAISE LOG 'permesso su azioni di stato — funzioni corrette: %', array_to_string(v_fatte, ', ');

  IF cardinality(v_fatte) < 3 THEN
    RAISE EXCEPTION 'attese 3 funzioni corrette, ne risultano %: %',
      cardinality(v_fatte), array_to_string(v_fatte, ', ');
  END IF;
END $$;
