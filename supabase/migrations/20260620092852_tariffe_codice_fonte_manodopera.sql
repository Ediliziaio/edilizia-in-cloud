-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.tariffe_aziendali ADD COLUMN IF NOT EXISTS codice text;
ALTER TABLE public.tariffe_aziendali ADD COLUMN IF NOT EXISTS fonte text;
ALTER TABLE public.tariffe_aziendali ADD COLUMN IF NOT EXISTS incidenza_manodopera_pct numeric;
COMMENT ON COLUMN public.tariffe_aziendali.codice IS 'Codice articolo/voce (es. dal prezzario regionale). Opzionale, utile per tracciabilità e match del computo.';
COMMENT ON COLUMN public.tariffe_aziendali.fonte IS 'Prezzario di provenienza della voce. NULL = voce inserita a mano.';
COMMENT ON COLUMN public.tariffe_aziendali.incidenza_manodopera_pct IS 'Incidenza manodopera frazionaria 0..1 (obbligo base d''asta). NULL = non specificata.';
