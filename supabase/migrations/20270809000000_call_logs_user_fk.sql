-- FIX scheda contatto "Errore nel caricamento di: chiamate": l'embed
-- PostgREST profiles:user_id(...) su call_logs falliva con 400 perché
-- mancava la FK call_logs.user_id → profiles(id). Orfani verificati: 0
-- al momento dell'applicazione.
ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON public.call_logs(user_id);
