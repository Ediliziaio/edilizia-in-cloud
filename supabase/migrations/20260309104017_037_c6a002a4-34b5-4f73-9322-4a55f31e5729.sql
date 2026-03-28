-- 5. quote_pdf_attachments — junction table
CREATE TABLE public.quote_pdf_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.quote_pdf_materials(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quote_id, material_id)
);
