-- Solo osservabilità: non riattiva cron/sequenze e non modifica code o invii.
-- Mantiene corpo, proprietario e privilegi della funzione già installata.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.sentinelle_effetti_cron()'::regprocedure);
  block_start integer;
  block_end integer;
  old_block text;
  old_outreach text := 'WHERE q.status = ''queued'' AND q.scheduled_for < now() - interval ''30 minutes''';
BEGIN
  block_start := strpos(definition, '-- 1. automation_queue');
  block_end := strpos(definition, '-- 3. outreach_send_queue');
  IF block_start = 0 OR block_end <= block_start THEN
    RAISE EXCEPTION 'Sentinella cambiata: verificare i blocchi prima di applicare la correzione';
  END IF;
  old_block := substr(definition, block_start, block_end - block_start);
  IF strpos(old_block, 'FROM public.internal_automation_queue q') = 0
     OR (length(old_block) - length(replace(old_block, 'q.created_at', ''))) / length('q.created_at') <> 4 THEN
    RAISE EXCEPTION 'Sentinella cambiata: attesi due controlli su created_at';
  END IF;
  definition := replace(definition, old_block, replace(old_block, 'q.created_at', 'q.execute_at'));
  IF strpos(definition, old_outreach) = 0 THEN
    RAISE EXCEPTION 'Sentinella outreach cambiata: verificare il filtro prima di procedere';
  END IF;
  definition := replace(definition, old_outreach, old_outreach || $filter$
     -- Le pause deliberate non sono un guasto del dispatcher.
     AND NOT EXISTS (
       SELECT 1 FROM public.outreach_enrollments e
       LEFT JOIN public.outreach_sequences s ON s.id = e.sequence_id
       WHERE e.id = q.enrollment_id
         AND (e.status = 'paused' OR s.status IN ('paused', 'archived'))
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.outreach_brands b
       WHERE b.id = q.brand_id AND b.status IN ('paused', 'archived')
     )$filter$);
  definition := replace(definition,
    'email con orario di invio passato da oltre 30 minuti e ancora in coda',
    'invii non in pausa con orario passato da oltre 30 minuti e ancora in coda (verificare anche finestre e limiti di invio)');
  EXECUTE definition;
END;
$migration$;

-- È una funzione interna con effetti (storico/notifiche), non una RPC utente.
REVOKE ALL ON FUNCTION public.sentinelle_effetti_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sentinelle_effetti_cron() TO service_role;
