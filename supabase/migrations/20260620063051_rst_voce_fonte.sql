-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS fonte text;
ALTER TABLE public.rst_listino_voci ADD COLUMN IF NOT EXISTS fonte text;
COMMENT ON COLUMN public.rst_computo_voci.fonte IS 'Prezzario regionale di provenienza della voce (per citazione base d''asta). NULL = voce libera/listino.';
