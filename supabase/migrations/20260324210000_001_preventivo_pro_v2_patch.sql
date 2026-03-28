-- Indice compound per filter+sort del listino per categoria
CREATE INDEX IF NOT EXISTS idx_at_categoria
  ON public.article_templates(company_id, categoria_id)
  WHERE categoria_id IS NOT NULL;
