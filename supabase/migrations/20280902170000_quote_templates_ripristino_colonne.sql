-- Template preventivo: il DB di produzione aveva la tabella quote_templates con
-- 41 colonne, senza `kind`, copertina, prodotto, collegamenti (le migration
-- 20270306 e 20270307 risultavano registrate ma le colonne non c'erano).
-- Il form della pagina Template preventivi manda sempre `kind` → PostgREST
-- rispondeva PGRST204 "Could not find the 'kind' column" e NESSUN template
-- poteva essere salvato (0 righe in tutto il DB).
-- Applicata a mano il 2026-09-02; qui per ogni altro ambiente. Idempotente.

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_title text,
  ADD COLUMN IF NOT EXISTS cover_subtitle text,
  ADD COLUMN IF NOT EXISTS show_cover_image boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contractual_terms_text text,
  ADD COLUMN IF NOT EXISTS legal_terms_text text,
  ADD COLUMN IF NOT EXISTS show_contractual_terms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_legal_terms boolean DEFAULT false;

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'offerta'
    CHECK (kind IN ('offerta', 'copertina', 'condizioni', 'legali', 'prodotto', 'sezione'));

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS linked_cover_id uuid REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_terms_id uuid REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_legal_id uuid REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_product_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_section_ids uuid[] DEFAULT '{}';

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_format text DEFAULT 'markdown'
    CHECK (body_format IN ('markdown', 'html', 'plain'));

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS product_image_url text,
  ADD COLUMN IF NOT EXISTS product_short_description text,
  ADD COLUMN IF NOT EXISTS product_long_description text,
  ADD COLUMN IF NOT EXISTS product_specs jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_indicative_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS product_unit text,
  ADD COLUMN IF NOT EXISTS product_category text;

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_quote_templates_kind
  ON public.quote_templates (company_id, kind, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quote_templates_product_category
  ON public.quote_templates (company_id, product_category) WHERE kind = 'prodotto' AND is_active = true;
DROP INDEX IF EXISTS uq_quote_templates_default_per_company;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_templates_default_per_company
  ON public.quote_templates (company_id) WHERE is_default = true AND is_active = true AND kind = 'offerta';

CREATE OR REPLACE VIEW public.v_quote_template_counts AS
SELECT company_id, kind, count(*) FILTER (WHERE is_active = true) AS active_count, count(*) AS total_count
FROM public.quote_templates GROUP BY company_id, kind;
GRANT SELECT ON public.v_quote_template_counts TO authenticated;

-- I trigger della migration 20270308 (hardening) mancavano pur esistendo le funzioni.
DROP TRIGGER IF EXISTS trg_quote_template_validate_links ON public.quote_templates;
CREATE TRIGGER trg_quote_template_validate_links
  BEFORE INSERT OR UPDATE ON public.quote_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_quote_template_validate_links();

DROP TRIGGER IF EXISTS trg_quote_template_cleanup_arrays ON public.quote_templates;
CREATE TRIGGER trg_quote_template_cleanup_arrays
  AFTER UPDATE ON public.quote_templates
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.tg_quote_template_cleanup_array_refs();
