-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


ALTER TABLE public.stock_lotti
  ADD COLUMN IF NOT EXISTS foto_url text;
COMMENT ON COLUMN public.stock_lotti.foto_url IS
  'URL pubblico foto del bancale/lotto (bucket article-images, path {company_id}/lotto-{id}.ext).';
