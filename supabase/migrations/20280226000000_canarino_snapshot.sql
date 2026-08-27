-- Il canarino calcola nel database, la edge function legge e spedisce.
--
-- canarino_vitali() via PostgREST moriva in statement timeout (8s del ruolo
-- authenticator): lo scan di cron.job_run_details attraversa 598 MB di pagine
-- gonfie e sull'indice non abbiamo poteri (la tabella e' di pg_cron, "must be
-- owner"). Quindi il calcolo lo fa un cron SQL — che gira come postgres,
-- senza timeout — e lo salva qui; la edge function legge una riga sola.
--
-- Se lo snapshot risulta piu' vecchio di due ore, il rapporto lo dice: un
-- canarino che non riesce nemmeno a raccogliere i dati e' il primo guasto
-- da segnalare.

CREATE TABLE IF NOT EXISTS public.ops_canarino_snapshot (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- una riga sola
  vitali jsonb NOT NULL,
  generato_alle timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_canarino_snapshot ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: ci arriva solo la service key della edge function.

-- Raccolta alle 04:50 UTC, dieci minuti prima dell'invio delle 05:00.
DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'ops-canarino-snapshot';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  PERFORM cron.schedule(
    'ops-canarino-snapshot',
    '50 4 * * *',
    $cmd$
      INSERT INTO public.ops_canarino_snapshot (id, vitali, generato_alle)
      VALUES (1, public.canarino_vitali(), now())
      ON CONFLICT (id) DO UPDATE SET vitali = EXCLUDED.vitali, generato_alle = EXCLUDED.generato_alle
    $cmd$
  );
END $$;

-- Primo riempimento, cosi' la edge function trova subito la riga.
INSERT INTO public.ops_canarino_snapshot (id, vitali, generato_alle)
VALUES (1, public.canarino_vitali(), now())
ON CONFLICT (id) DO UPDATE SET vitali = EXCLUDED.vitali, generato_alle = EXCLUDED.generato_alle;

NOTIFY pgrst, 'reload schema';
