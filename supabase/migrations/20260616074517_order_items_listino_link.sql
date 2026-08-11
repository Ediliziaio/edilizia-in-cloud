-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

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
