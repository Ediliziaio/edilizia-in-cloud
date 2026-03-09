
-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_quote_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table
CREATE TABLE IF NOT EXISTS public.quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Template Personalizzato',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  layout TEXT NOT NULL DEFAULT 'classic',
  logo_url TEXT,
  logo_position TEXT DEFAULT 'left',
  logo_size TEXT DEFAULT 'medium',
  show_logo BOOLEAN DEFAULT true,
  primary_color TEXT DEFAULT '#1E40AF',
  secondary_color TEXT DEFAULT '#3B82F6',
  accent_color TEXT DEFAULT '#DBEAFE',
  text_color TEXT DEFAULT '#111827',
  header_text_color TEXT DEFAULT '#FFFFFF',
  font_family TEXT DEFAULT 'helvetica',
  show_quote_number BOOLEAN DEFAULT true,
  show_validity_date BOOLEAN DEFAULT true,
  show_company_details BOOLEAN DEFAULT true,
  show_client_details BOOLEAN DEFAULT true,
  show_payment_terms BOOLEAN DEFAULT true,
  show_delivery_terms BOOLEAN DEFAULT true,
  show_notes BOOLEAN DEFAULT true,
  show_page_numbers BOOLEAN DEFAULT true,
  footer_text TEXT DEFAULT '',
  cover_tagline TEXT DEFAULT '',
  show_watermark BOOLEAN DEFAULT false,
  watermark_text TEXT DEFAULT 'OFFERTA RISERVATA',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quote_templates_company ON public.quote_templates(company_id);

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_read_templates"
ON public.quote_templates FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "company_admin_manage_templates"
ON public.quote_templates FOR ALL TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.quote_templates
    SET is_default = false
    WHERE company_id = NEW.company_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER single_default_template
BEFORE INSERT OR UPDATE ON public.quote_templates
FOR EACH ROW WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.enforce_single_default_template();

CREATE TRIGGER quote_templates_updated_at
BEFORE UPDATE ON public.quote_templates
FOR EACH ROW EXECUTE FUNCTION public.set_quote_templates_updated_at();

-- Add template_id to quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS
  template_id UUID REFERENCES public.quote_templates(id) ON DELETE SET NULL;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-template-assets', 'quote-template-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "company_upload_template_assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-template-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

CREATE POLICY "company_read_template_assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'quote-template-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

CREATE POLICY "company_delete_template_assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'quote-template-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);
