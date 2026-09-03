-- ════════════════════════════════════════════════════════════════════════════
-- Numero WhatsApp bannato: l'avviso parte una volta, non ogni mattina per sempre
-- ════════════════════════════════════════════════════════════════════════════
-- La migration 20280239000000 aveva costruito il meccanismo completo: il
-- trigger mette in pausa le campagne e marca `ban_rilevato_at`,
-- `openwa_numeri_bannati_da_avvisare()` elenca i numeri da comunicare e
-- `openwa_numero_ban_avvisato()` li segna come comunicati.
--
-- Ma le ultime due NON venivano chiamate da nessuno (verificato: zero
-- riferimenti nel codice e zero funzioni del DB che le invocano), e
-- `canarino_vitali` leggeva la tabella con un semplice `WHERE stato='banned'`.
-- Risultato: lo stesso numero bannato compariva nel rapporto mattutino ogni
-- giorno per sempre, anche dopo che l'avevi visto e gestito. Un allarme che
-- suona ogni mattina è un allarme che si impara a ignorare — e il giorno che
-- cade il secondo numero non lo leggi.
--
-- Ora: si avvisa alla scoperta, poi si tace, e si ri-avvisa dopo 7 giorni se il
-- numero è ancora bannato (un numero perso da una settimana è capacità che
-- qualcuno deve decidere se recuperare o sostituire). Il trigger già azzera
-- entrambe le date quando il numero torna connesso.
--
-- Nota sul momento in cui si segna: `ops_canarino_raccogli` (cron 04:50)
-- scrive lo snapshot e SUBITO DOPO segna i numeri. Il rapporto delle 05:00
-- legge lo snapshot già congelato, quindi li vede comunque. Se l'invio della
-- mail fallisse, quell'avviso è perso: restano però il badge in pagina
-- ("WhatsApp ha bloccato questo numero") e le campagne in pausa.
--
-- Verificato in prod e rollbackato: ban → 1 campagna in pausa, prima raccolta
-- lo mette nello snapshot e azzera la coda, seconda raccolta non ripete,
-- ritorno a connected riarma l'avviso.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Elenco dei numeri da comunicare: mai avvisati, o avvisati da oltre 7 giorni.
CREATE OR REPLACE FUNCTION public.openwa_numeri_bannati_da_avvisare()
RETURNS TABLE(numero_id uuid, numero text, ban_rilevato_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT n.id, n.numero, n.ban_rilevato_at
  FROM public.openwa_numbers n
  WHERE n.stato = 'banned'
    AND n.ban_rilevato_at IS NOT NULL
    AND (n.ban_avvisato_at IS NULL OR n.ban_avvisato_at < now() - interval '7 days');
$function$;

REVOKE ALL ON FUNCTION public.openwa_numeri_bannati_da_avvisare() FROM PUBLIC, anon, authenticated;

-- 2. Il canarino smette di ripetersi: stesso predicato dell'elenco.
--    Sostituzione CHIRURGICA sulla definizione viva (4.891 caratteri, una sola
--    occorrenza del predicato): riscrivere a mano una funzione così grande solo
--    per una riga è il modo migliore per perderci un pezzo per strada.
DO $$
DECLARE
  _def text;
  _nuovo text;
  _vecchio_predicato text := 'FROM public.openwa_numbers n WHERE n.stato = ''banned''';
  _nuovo_predicato text := 'FROM public.openwa_numbers n WHERE n.stato = ''banned'' AND (n.ban_avvisato_at IS NULL OR n.ban_avvisato_at < now() - interval ''7 days'')';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'canarino_vitali';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'canarino_vitali non trovata: niente da sostituire';
  END IF;

  IF position(_vecchio_predicato IN _def) = 0 THEN
    -- Già applicata (idempotenza) oppure la funzione è stata riscritta: in
    -- entrambi i casi meglio fermarsi che applicare una patch alla cieca.
    IF position('ban_avvisato_at' IN _def) > 0 THEN
      RAISE NOTICE 'canarino_vitali già filtra su ban_avvisato_at: nulla da fare';
      RETURN;
    END IF;
    RAISE EXCEPTION 'predicato atteso non trovato in canarino_vitali: verificare a mano';
  END IF;

  _nuovo := replace(_def, _vecchio_predicato, _nuovo_predicato);
  EXECUTE _nuovo;

  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'canarino_vitali';
  IF position('ban_avvisato_at' IN _def) = 0 THEN
    RAISE EXCEPTION 'sostituzione non applicata a canarino_vitali';
  END IF;
END $$;

-- 3. Chi segna l'avviso: il cron che raccoglie i vitali, subito dopo lo snapshot.
CREATE OR REPLACE FUNCTION public.ops_canarino_raccogli()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
BEGIN
  INSERT INTO public.ops_cron_visti (jobid, jobname)
  SELECT j.jobid, j.jobname FROM cron.job j
  ON CONFLICT (jobid) DO UPDATE SET jobname = EXCLUDED.jobname;

  -- I job spariti non devono restare nel registro a sporcarlo.
  DELETE FROM public.ops_cron_visti v
  WHERE NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobid = v.jobid);

  INSERT INTO public.ops_canarino_snapshot (id, vitali, generato_alle)
  VALUES (1, public.canarino_vitali(), now())
  ON CONFLICT (id) DO UPDATE
    SET vitali = EXCLUDED.vitali, generato_alle = EXCLUDED.generato_alle;

  -- I numeri bannati appena messi nello snapshot risultano comunicati: domani
  -- non si ripetono. Lo snapshot è già scritto sopra, quindi il rapporto delle
  -- 05:00 li vede comunque.
  PERFORM public.openwa_numero_ban_avvisato(b.numero_id)
  FROM public.openwa_numeri_bannati_da_avvisare() b;
END;
$function$;
