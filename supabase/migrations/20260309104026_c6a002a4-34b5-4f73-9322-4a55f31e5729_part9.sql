-- 2. quote_pdf_materials — library of reusable PDF attachments
CREATE TABLE IF NOT EXISTS public.quote_pdf_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'generale',
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT DEFAULT 0,
  article_template_id UUID REFERENCES public.article_templates(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
