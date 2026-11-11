-- AdminAIMemoryPage sottoscrive postgres_changes su ai_persona_memory, ma la
-- tabella non era nella publication supabase_realtime: la subscription non
-- riceveva MAI eventi ("aggiornamento in tempo reale" morto dal giorno 1).
DO $realtime_membership$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='ai_persona_memory') THEN
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_persona_memory;
END IF;END $realtime_membership$;
