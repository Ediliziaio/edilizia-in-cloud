-- FIX scheda contatto "Errore nel caricamento di: chiamate": l'embed
-- PostgREST profiles:user_id(...) su call_logs falliva con 400 perché
-- mancava la FK call_logs.user_id → profiles(id). Orfani verificati: 0
-- al momento dell'applicazione.
DO $call_logs_fk$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.call_logs'::regclass AND conname='call_logs_user_id_fkey') THEN
ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
 ELSIF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.call_logs'::regclass AND conname='call_logs_user_id_fkey' AND confrelid='public.profiles'::regclass AND confdeltype='n') THEN RAISE EXCEPTION 'FK call_logs.user_id inattesa';END IF;
END $call_logs_fk$;

CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON public.call_logs(user_id);
