-- silvio_action_queue_claim andava in errore a ogni giro:
--   column reference "id" is ambiguous
--
-- La funzione dichiara RETURNS TABLE(id uuid, ...), e in plpgsql i nomi delle
-- colonne di ritorno sono variabili in scope su TUTTO il corpo. Dentro la CTE
-- `locked` c'era un `SELECT id FROM public.silvio_action_queue` non
-- qualificato: Postgres non sa se `id` sia la colonna o la variabile, e si
-- ferma. E' un errore di analisi, quindi scattava anche a coda vuota — il
-- runner rispondeva 500 con processed: 0 ogni 30 secondi, e non avrebbe
-- lavorato una singola azione nemmeno con la coda piena.
--
-- La seconda CTE era gia' qualificata (q.id): mancava solo la prima.
CREATE OR REPLACE FUNCTION public.silvio_action_queue_claim(p_max integer DEFAULT 10)
RETURNS TABLE(id uuid, action_type text, payload jsonb, attempts integer,
              max_attempts integer, workflow_run_id uuid, step_index integer,
              initiated_by text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_role TEXT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH locked AS (
    SELECT coda.id AS queue_id
    FROM public.silvio_action_queue AS coda
    WHERE coda.status = 'queued'
      AND coda.scheduled_for <= now()
      AND coda.requires_approval = false
    ORDER BY coda.scheduled_for
    FOR UPDATE SKIP LOCKED
    LIMIT p_max
  ),
  claimed AS (
    UPDATE public.silvio_action_queue q
    SET status = 'running',
        started_at = now()
    WHERE q.id IN (SELECT l.queue_id FROM locked l)
    RETURNING q.id, q.action_type, q.payload, q.attempts, q.max_attempts,
              q.workflow_run_id, q.step_index, q.initiated_by
  )
  SELECT * FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.silvio_action_queue_claim(integer) FROM PUBLIC, anon, authenticated;
