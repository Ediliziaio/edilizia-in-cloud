-- Scheda PDF per singola variante: un documento di article_family_documents può
-- essere legato alla famiglia (axis_value_id NULL, comportamento storico) oppure
-- a una specifica variante (article_family_axis_values). ON DELETE CASCADE: se la
-- variante viene eliminata, le sue schede spariscono con lei.
ALTER TABLE public.article_family_documents
  ADD COLUMN IF NOT EXISTS axis_value_id uuid
  REFERENCES public.article_family_axis_values(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_afd_axis_value
  ON public.article_family_documents(axis_value_id) WHERE axis_value_id IS NOT NULL;

COMMENT ON COLUMN public.article_family_documents.axis_value_id IS
  'Se valorizzato, la scheda è legata a questa variante (article_family_axis_values), non alla famiglia.';
