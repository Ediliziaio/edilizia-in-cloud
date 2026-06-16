-- ============================================================================
-- order_items ↔ listino: aggancio al listino prodotti + categoria snapshot
-- ============================================================================
-- Abilita il controllo di gestione per prodotto/categoria e il confronto
-- costo STANDARD (da listino, in order_items.standard_cost) vs costo REALE
-- (purchase_price / ordini fornitore). Additivo: colonne nullable, nessun
-- impatto sullo storico. Le righe esistenti restano scollegate (link solo
-- per i nuovi inserimenti dal listino).
-- ============================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS article_template_id uuid
    REFERENCES public.article_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria text;

CREATE INDEX IF NOT EXISTS idx_order_items_article_template
  ON public.order_items(article_template_id)
  WHERE article_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_categoria
  ON public.order_items(categoria)
  WHERE categoria IS NOT NULL;

COMMENT ON COLUMN public.order_items.article_template_id IS
  'Link al listino (article_templates) da cui è stata presa la riga. Abilita analisi prodotto/categoria e confronto standard(listino) vs reale.';
COMMENT ON COLUMN public.order_items.categoria IS
  'Snapshot della categoria prodotto dal listino al momento dell''inserimento (aggregazioni stabili nel tempo).';
