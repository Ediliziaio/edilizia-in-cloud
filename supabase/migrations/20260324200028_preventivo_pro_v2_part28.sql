-- Indice per raggruppamento per categoria nella vista e nei calcoli
CREATE INDEX IF NOT EXISTS idx_qi_category
  ON public.quote_items(quote_id, item_category);
