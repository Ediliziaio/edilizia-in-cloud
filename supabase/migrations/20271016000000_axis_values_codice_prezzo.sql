-- P3: la variante (article_family_axis_values) diventa un'entità completa.
-- Oltre a label/valore/maggiorazione aggiunge:
--  - codice: SKU proprio della variante (collega alla giacenza via warehouse_stock.internal_code)
--  - prezzo_vendita / prezzo_acquisto: prezzo ASSOLUTO della variante (alternativa
--    alla maggiorazione sul prezzo base famiglia; usato quando il base = 0 e ogni
--    variante è un prodotto distinto col suo prezzo).
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
