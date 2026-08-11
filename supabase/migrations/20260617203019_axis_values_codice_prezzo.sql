-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- P3: la variante (article_family_axis_values) diventa entità completa con
-- codice proprio + prezzo assoluto (alternativa alla maggiorazione sul base).
ALTER TABLE public.article_family_axis_values
  ADD COLUMN IF NOT EXISTS codice text,
  ADD COLUMN IF NOT EXISTS prezzo_vendita numeric,
  ADD COLUMN IF NOT EXISTS prezzo_acquisto numeric;
COMMENT ON COLUMN public.article_family_axis_values.codice IS
  'Codice/SKU proprio della variante; se valorizzato collega alla giacenza via warehouse_stock.internal_code.';
COMMENT ON COLUMN public.article_family_axis_values.prezzo_vendita IS
  'Prezzo di vendita assoluto della variante (se valorizzato prevale sulla maggiorazione sul prezzo base famiglia).';
COMMENT ON COLUMN public.article_family_axis_values.prezzo_acquisto IS
  'Prezzo di acquisto assoluto della variante.';
