-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Silvio chat AZIENDA girava su openai/gpt-4o-mini (modello debole per un
-- orchestratore con 100+ tool e ragionamento cross-area) mentre admin/worker/
-- brief usano già claude-sonnet-4.5. Lo allineiamo a sonnet-4.5:
--  • POTENZA: ragionamento e tool-routing molto migliori sull'intero ecosistema.
--  • TOKEN/COSTO: sblocca il prompt-caching Anthropic (il breakpoint cache_control
--    in aiRouter è gated ai modelli anthropic/) → ~90% di sconto sull'input
--    ripetuto (system + tool schemas) lungo il loop multi-iterazione.
UPDATE public.ai_router_config
SET primary_model = 'anthropic/claude-sonnet-4.5', updated_at = now()
WHERE task_key = 'persona_silvio';
