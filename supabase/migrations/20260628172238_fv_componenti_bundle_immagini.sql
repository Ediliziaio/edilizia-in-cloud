-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.articoli_native
  ADD COLUMN IF NOT EXISTS immagine_url text;

COMMENT ON COLUMN public.articoli_native.immagine_url IS
  'Foto del componente FV (pannello/inverter/accumulo), mostrata nella pagina Componenti del preventivo PDF.';

ALTER TABLE public.bundle_voci
  ADD COLUMN IF NOT EXISTS immagine_url text;

COMMENT ON COLUMN public.bundle_voci.immagine_url IS
  'Foto del prodotto della voce bundle, mostrata nella pagina kit del preventivo PDF.';
