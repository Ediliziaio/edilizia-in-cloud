-- Il canarino allinea la finestra al promemoria settimanale del dunning.
--
-- `process-dunning` ora, passato il periodo di grazia e con l'annullamento
-- automatico spento, manda al super admin un avviso "decisione richiesta" e lo
-- ripete UNA VOLTA A SETTIMANA finché il caso resta aperto (chiave
-- dunning_admin_escalation_w<N>, registrata in dunning_attempts come 'sent').
--
-- La sezione `dunning_fermo` guardava indietro 4 giorni: con un promemoria
-- settimanale avrebbe suonato 3 mattine su 7 pur essendo tutto in ordine.
-- Portata a 8 giorni: il promemoria la tiene zitta, e se il dunning si blocca
-- per davvero (nessun tentativo per più di una settimana) torna a suonare.
--
-- Sostituzione chirurgica: una sola occorrenza del predicato in tutta la
-- funzione (verificato con regexp_matches prima di toccarla).
DO $$
DECLARE
  _def text;
  _vecchio text := 'da.created_at > now() - interval ''4 days''';
  _nuovo  text := 'da.created_at > now() - interval ''8 days''';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'canarino_vitali';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'canarino_vitali non trovata';
  END IF;

  IF position(_vecchio IN _def) = 0 THEN
    IF position(_nuovo IN _def) > 0 THEN
      RAISE NOTICE 'finestra già a 8 giorni: nulla da fare';
      RETURN;
    END IF;
    RAISE EXCEPTION 'predicato dunning non trovato: verificare a mano';
  END IF;

  EXECUTE replace(_def, _vecchio, _nuovo);

  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'canarino_vitali';
  IF position(_nuovo IN _def) = 0 THEN
    RAISE EXCEPTION 'sostituzione non applicata';
  END IF;
END $$;
