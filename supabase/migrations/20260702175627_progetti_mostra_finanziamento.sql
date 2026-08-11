-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.rst_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.tet_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.bgn_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.clm_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.ele_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.idr_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.pav_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.pis_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
