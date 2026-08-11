-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.fv_progetti ADD COLUMN IF NOT EXISTS azimut_tetto numeric;
ALTER TABLE public.fv_progetti ADD COLUMN IF NOT EXISTS inclinazione_tetto numeric;
ALTER TABLE public.fv_progetti ADD COLUMN IF NOT EXISTS layout_tetto jsonb;
COMMENT ON COLUMN public.fv_progetti.azimut_tetto IS 'F16 — Orientamento prevalente della falda in gradi (0=Nord, 90=Est, 180=Sud, 270=Ovest). Da Google Solar API.';
COMMENT ON COLUMN public.fv_progetti.inclinazione_tetto IS 'F16 — Inclinazione (pendenza) della falda prevalente in gradi. Da Google Solar API.';
COMMENT ON COLUMN public.fv_progetti.layout_tetto IS 'F16 — Layout reale dei pannelli (coordinate/segmenti) suggerito dalla Solar API.';
