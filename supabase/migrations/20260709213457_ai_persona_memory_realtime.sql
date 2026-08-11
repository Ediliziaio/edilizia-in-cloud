-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- AdminAIMemoryPage sottoscrive postgres_changes su ai_persona_memory, ma la
-- tabella non era nella publication supabase_realtime: la subscription non
-- riceveva MAI eventi ("aggiornamento in tempo reale" morto dal giorno 1).
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_persona_memory;
