-- v8.6.23 — Abilita Realtime su render_sessions
--
-- Il client (RenderNewV2.tsx) usa Supabase Realtime per ricevere push
-- immediato quando una render_session completa, invece di fare polling
-- ogni 3-15s. Per funzionare, la tabella deve essere parte della
-- publication `supabase_realtime`.
--
-- L'RLS esistente (`co_render_sessions`) continua a filtrare le righe per
-- company_id dell'utente: l'utente riceve push SOLO per le sessioni
-- della sua company.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'render_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.render_sessions;
  END IF;
END $$;
