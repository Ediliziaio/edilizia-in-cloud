-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.3 — sentinelle che guardano l'effetto, non l'esecuzione
-- ════════════════════════════════════════════════════════════════════════════
--
-- Esiste già `cron_health_check()`, ogni 15 minuti: legge net._http_response e
-- registra le risposte 4xx/5xx. È utile e resta. Ma vede solo le chiamate che
-- hanno fallito rumorosamente. Non vede:
--   • un cron che risponde 200 e non fa niente;
--   • un cron disattivato mentre la sua coda continua a riempirsi;
--   • un consumatore che non è mai stato messo in calendario.
--
-- Le ultime due non sono ipotesi. Guardando le code prima di scrivere:
--   wa_notifiche_event_queue ... 4 eventi non processati, il più vecchio del
--                                2026-07-10. Il consumatore è
--                                `check-wa-notifiche`, che in cron.job NON C'È:
--                                secondo i report storici doveva girare ogni
--                                15 minuti. Non è mai stato pianificato, o è
--                                stato tolto. Nessun log lo dice, perché non
--                                c'è nessun log da guardare.
--   automation_queue ........... 16 righe 'failed'.
--
-- E poi il difetto che rende il resto inutile: `cron_health_check()` cercava i
-- destinatari fra i super_admin con `profiles.company_id` non nullo. L'unico
-- super_admin della piattaforma ce l'ha NULLO. La join lo scartava, il ciclo
-- non girava, nessuna notifica partiva. Verificato:
-- `SELECT count(*) FROM notifications WHERE type='cron_failure'` → 0, in tutta
-- la vita del sistema. La campanella suonava a nessuno.
--
-- Il criterio delle sentinelle: una coda vuota non è un allarme, e un cron che
-- non ha niente da fare non è rotto. Suonano solo quando c'è del lavoro fermo
-- da più di quanto quel cron dovrebbe metterci.

CREATE TABLE IF NOT EXISTS public.cron_sentinelle_esiti (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controllo    text        NOT NULL,
  esito        text        NOT NULL CHECK (esito IN ('ok', 'in_ritardo', 'cron_spento', 'cron_assente')),
  arretrato    integer     NOT NULL DEFAULT 0,
  piu_vecchio  timestamptz,
  dettaglio    text,
  -- clock_timestamp e non now(): dentro una transazione now() è sempre lo
  -- stesso istante, e due giri consecutivi risulterebbero simultanei.
  misurato_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_sentinelle_controllo_tempo
  ON public.cron_sentinelle_esiti (controllo, misurato_at DESC);

ALTER TABLE public.cron_sentinelle_esiti ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.cron_sentinelle_esiti'::regclass
                   AND polname='sentinelle_solo_super_admin') THEN
    CREATE POLICY sentinelle_solo_super_admin ON public.cron_sentinelle_esiti
      FOR SELECT TO authenticated
      USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));
  END IF;
END $$;

COMMENT ON TABLE public.cron_sentinelle_esiti IS
  'Storico delle sentinelle sull''effetto dei cron. Una riga per controllo per giro: serve a distinguere «non è mai andato» da «è andato ora».';

-- ── Chi va avvisato ──────────────────────────────────────────────────────────
-- notifications.company_id è NOT NULL, quindi non basta togliere il filtro:
-- serve un'azienda su cui appoggiare la notifica. Quella di piattaforma è il
-- posto giusto per un super_admin che non ne ha una propria.
CREATE OR REPLACE FUNCTION public.destinatari_allarmi_piattaforma()
RETURNS TABLE(user_id uuid, company_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id,
         coalesce(p.company_id, '00000000-0000-0000-0000-000000000001'::uuid)
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.role = 'super_admin';
$function$;

COMMENT ON FUNCTION public.destinatari_allarmi_piattaforma() IS
  'Chi deve ricevere gli allarmi di sistema. Un super_admin senza azienda va avvisato lo stesso.';

REVOKE ALL ON FUNCTION public.destinatari_allarmi_piattaforma() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.destinatari_allarmi_piattaforma() TO service_role;

-- ── Le sentinelle ────────────────────────────────────────────────────────────
-- I controlli sono scritti qui dentro, non in una tabella con dentro del SQL
-- da eseguire: una funzione SECURITY DEFINER che esegue stringhe prese da una
-- tabella è una porta aperta. Aggiungere una sentinella costa una migrazione.
-- È il prezzo giusto.
CREATE OR REPLACE FUNCTION public.sentinelle_effetti_cron()
RETURNS TABLE(controllo text, esito text, arretrato integer, dettaglio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nuovi_guasti int := 0;
  r record;
  f record;
BEGIN
  -- ON COMMIT DROP non basta: due chiamate nella stessa transazione si
  -- scontrerebbero. Da cron non capita mai, ma un test se ne accorge.
  DROP TABLE IF EXISTS _sent;
  CREATE TEMP TABLE _sent (
    controllo text, esito text, arretrato int, piu_vecchio timestamptz, dettaglio text
  ) ON COMMIT DROP;

  -- 1. automation_queue → process-automation-queue, ogni minuto
  INSERT INTO _sent
  SELECT 'automation_queue',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'in_ritardo' END,
         count(*)::int, min(q.created_at),
         CASE WHEN count(*) = 0 THEN 'nessuna automazione in attesa'
              ELSE format('%s automazioni ferme in coda da più di 15 minuti (process-automation-queue gira ogni minuto)', count(*)) END
    FROM public.automation_queue q
   WHERE q.status = 'pending' AND q.created_at < now() - interval '15 minutes';

  -- 2. internal_automation_queue → process-internal-automation-queue (oggi spento)
  INSERT INTO _sent
  SELECT 'internal_automation_queue',
         CASE WHEN count(*) = 0 THEN 'ok'
              WHEN EXISTS (SELECT 1 FROM cron.job j
                            WHERE j.jobname = 'process-internal-automation-queue' AND j.active)
              THEN 'in_ritardo' ELSE 'cron_spento' END,
         count(*)::int, min(q.created_at),
         CASE WHEN count(*) = 0 THEN 'nessuna automazione interna in attesa'
              ELSE format('%s automazioni interne ferme; il cron process-internal-automation-queue è %s',
                          count(*),
                          CASE WHEN EXISTS (SELECT 1 FROM cron.job j
                                             WHERE j.jobname='process-internal-automation-queue' AND j.active)
                               THEN 'attivo' ELSE 'DISATTIVATO' END) END
    FROM public.internal_automation_queue q
   WHERE q.status = 'pending' AND q.created_at < now() - interval '15 minutes';

  -- 3. outreach_send_queue → outreach-dispatch, ogni 10 minuti
  INSERT INTO _sent
  SELECT 'outreach_send_queue',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'in_ritardo' END,
         count(*)::int, min(q.scheduled_for),
         CASE WHEN count(*) = 0 THEN 'nessun invio in attesa oltre l''orario'
              ELSE format('%s email con orario di invio passato da oltre 30 minuti e ancora in coda', count(*)) END
    FROM public.outreach_send_queue q
   WHERE q.status = 'queued' AND q.scheduled_for < now() - interval '30 minutes';

  -- 4. silvio_action_queue → silvio-action-runner, ogni 30 secondi.
  --    'awaiting_approval' è un'attesa legittima: aspetta una persona.
  INSERT INTO _sent
  SELECT 'silvio_action_queue',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'in_ritardo' END,
         count(*)::int, min(q.scheduled_for),
         CASE WHEN count(*) = 0 THEN 'nessuna azione in attesa oltre l''orario'
              ELSE format('%s azioni con orario passato da oltre 15 minuti e ancora in coda', count(*)) END
    FROM public.silvio_action_queue q
   WHERE q.status = 'queued' AND q.scheduled_for < now() - interval '15 minutes';

  -- 5. wa_notifiche_event_queue → check-wa-notifiche, che in cron.job non esiste
  INSERT INTO _sent
  SELECT 'wa_notifiche_event_queue',
         CASE WHEN count(*) = 0 THEN 'ok'
              WHEN NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.command ILIKE '%check-wa-notifiche%')
              THEN 'cron_assente' ELSE 'in_ritardo' END,
         count(*)::int, min(q.created_at),
         CASE WHEN count(*) = 0 THEN 'nessun evento WhatsApp da processare'
              ELSE format('%s eventi non processati, il più vecchio del %s; consumatore atteso: check-wa-notifiche%s',
                          count(*), min(q.created_at)::date,
                          CASE WHEN NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.command ILIKE '%check-wa-notifiche%')
                               THEN ' — che NON è pianificato in cron.job' ELSE '' END) END
    FROM public.wa_notifiche_event_queue q
   WHERE q.processed IS NOT TRUE AND q.created_at < now() - interval '1 hour';

  -- 6. I cron disattivati: non è un guasto, ma va detto invece che scoperto
  INSERT INTO _sent
  SELECT 'cron_disattivati',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'cron_spento' END,
         count(*)::int, NULL,
         CASE WHEN count(*) = 0 THEN 'tutti i cron sono attivi'
              ELSE format('cron disattivati: %s', string_agg(j.jobname, ', ' ORDER BY j.jobname)) END
    FROM cron.job j WHERE NOT j.active;

  INSERT INTO public.cron_sentinelle_esiti (controllo, esito, arretrato, piu_vecchio, dettaglio)
  SELECT s.controllo, s.esito, s.arretrato, s.piu_vecchio, s.dettaglio FROM _sent s;

  -- Suona solo quando qualcosa passa da «a posto» a «non a posto»: una coda
  -- ferma da due mesi non deve produrre una notifica ogni quarto d'ora.
  FOR r IN SELECT * FROM _sent s WHERE s.esito <> 'ok' LOOP
    IF coalesce((
         SELECT e.esito FROM public.cron_sentinelle_esiti e
          WHERE e.controllo = r.controllo
            AND e.misurato_at < (SELECT max(e2.misurato_at) FROM public.cron_sentinelle_esiti e2
                                  WHERE e2.controllo = r.controllo)
          ORDER BY e.misurato_at DESC LIMIT 1), 'ok') = 'ok' THEN
      v_nuovi_guasti := v_nuovi_guasti + 1;
      FOR f IN SELECT d.user_id, d.company_id FROM public.destinatari_allarmi_piattaforma() d
      LOOP
        INSERT INTO public.notifications (company_id, user_id, type, title, body, action_url)
        VALUES (f.company_id, f.user_id, 'cron_effetto_mancante',
                format('Sentinella: %s', r.controllo), r.dettaglio, '/admin');
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT s.controllo, s.esito, s.arretrato, s.dettaglio FROM _sent s ORDER BY s.esito, s.controllo;
END $function$;

REVOKE ALL ON FUNCTION public.sentinelle_effetti_cron() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sentinelle_effetti_cron() TO service_role;

-- ── La campanella di cron_health_check, ricollegata ──────────────────────────
-- Sostituzione sul catalogo invece di ritrascrivere una funzione che non ho
-- scritto io: spaziatura e maiuscole differiscono, quindi il criterio è una
-- espressione regolare e non un letterale da azzeccare.
DO $$
DECLARE
  d text; n text;
  modello constant text :=
    'select\s+p\.id\s+as\s+user_id,\s*p\.company_id\s+from\s+(public\.)?user_roles\s+ur\s+'
    'join\s+(public\.)?profiles\s+p\s+on\s+p\.id\s*=\s*ur\.user_id\s+'
    'where\s+ur\.role\s*=\s*''super_admin''\s+and\s+p\.company_id\s+is\s+not\s+null';
  nuovo constant text := 'SELECT d.user_id, d.company_id FROM public.destinatari_allarmi_piattaforma() d';
BEGIN
  d := pg_get_functiondef('public.cron_health_check()'::regprocedure);
  n := regexp_replace(d, modello, nuovo, 'gi');
  IF n = d AND d NOT LIKE '%destinatari_allarmi_piattaforma%' THEN
    RAISE EXCEPTION 'ciclo destinatari non trovato in cron_health_check: la sostituzione sarebbe stata muta';
  END IF;
  IF n <> d THEN EXECUTE n; END IF;
END $$;
