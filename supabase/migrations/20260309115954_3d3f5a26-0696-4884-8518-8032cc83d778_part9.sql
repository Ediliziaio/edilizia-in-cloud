-- Add template_id to quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS
  template_id UUID REFERENCES public.quote_templates(id) ON DELETE SET NULL;
