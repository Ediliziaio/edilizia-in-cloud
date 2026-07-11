-- AdminAIMemoryPage sottoscrive postgres_changes su ai_persona_memory, ma la
-- tabella non era nella publication supabase_realtime: la subscription non
-- riceveva MAI eventi ("aggiornamento in tempo reale" morto dal giorno 1).
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_persona_memory;
