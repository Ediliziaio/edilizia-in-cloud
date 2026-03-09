
-- =============================================
-- QUOTES MODULE — Tables, Functions, Triggers, RLS, Storage
-- =============================================

-- 1. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-materials', 'quote-materials', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-pdfs', 'quote-pdfs', false) ON CONFLICT DO NOTHING;

-- Storage policies for quote-materials
CREATE POLICY "qm_sel" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

CREATE POLICY "qm_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

CREATE POLICY "qm_del" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

-- Storage policies for quote-pdfs
CREATE POLICY "qp_sel" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

CREATE POLICY "qp_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

CREATE POLICY "qp_del" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);

-- Public read for quote-pdfs via signature token (anon can download shared PDFs)
CREATE POLICY "qp_anon_sel" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'quote-pdfs');

-- 2. quote_pdf_materials — library of reusable PDF attachments
CREATE TABLE public.quote_pdf_materials (
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
CREATE INDEX idx_qpm_company ON public.quote_pdf_materials(company_id);
ALTER TABLE public.quote_pdf_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qpm_sel" ON public.quote_pdf_materials FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "qpm_ins" ON public.quote_pdf_materials FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "qpm_upd" ON public.quote_pdf_materials FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "qpm_del" ON public.quote_pdf_materials FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

-- 3. quotes — main quotes/preventivi table
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'bozza',
  -- Client info (denormalized for PDF)
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_company TEXT,
  client_address TEXT,
  client_fiscal_code TEXT,
  client_vat_number TEXT,
  -- Content
  title TEXT DEFAULT 'Preventivo',
  description TEXT,
  notes TEXT,
  internal_notes TEXT,
  terms_and_conditions TEXT,
  validity_days INTEGER DEFAULT 30,
  expires_at TIMESTAMPTZ,
  -- Totals (auto-calculated by trigger)
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  -- PDF
  pdf_storage_path TEXT,
  pdf_generated_at TIMESTAMPTZ,
  -- Signature
  signature_token UUID,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_ip TEXT,
  refused_at TIMESTAMPTZ,
  refused_reason TEXT,
  -- Opportunity link
  opportunity_id UUID REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  -- Meta
  created_by UUID NOT NULL,
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_company ON public.quotes(company_id);
CREATE INDEX idx_quotes_status ON public.quotes(company_id, status);
CREATE INDEX idx_quotes_contact ON public.quotes(contact_id);
CREATE INDEX idx_quotes_token ON public.quotes(signature_token) WHERE signature_token IS NOT NULL;
CREATE UNIQUE INDEX idx_quotes_number ON public.quotes(company_id, quote_number);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "q_sel" ON public.quotes FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "q_ins" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "q_upd" ON public.quotes FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "q_del" ON public.quotes FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

-- Anon policy for public signature page
CREATE POLICY "q_anon_sel" ON public.quotes FOR SELECT TO anon
  USING (signature_token IS NOT NULL AND status IN ('inviata', 'accettata', 'rifiutata', 'scaduta'));

-- 4. quote_items — line items
CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'product',
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22,
  line_total NUMERIC(12,2) DEFAULT 0,
  unit_of_measure TEXT DEFAULT 'pz',
  image_url TEXT,
  article_template_id UUID REFERENCES public.article_templates(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qi_quote ON public.quote_items(quote_id);
CREATE INDEX idx_qi_company ON public.quote_items(company_id);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qi_sel" ON public.quote_items FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "qi_ins" ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "qi_upd" ON public.quote_items FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "qi_del" ON public.quote_items FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

-- Anon policy for public signature page (read items of viewable quotes)
CREATE POLICY "qi_anon_sel" ON public.quote_items FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_id AND q.signature_token IS NOT NULL
    AND q.status IN ('inviata', 'accettata', 'rifiutata', 'scaduta')
  ));

-- 5. quote_pdf_attachments — junction table
CREATE TABLE public.quote_pdf_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.quote_pdf_materials(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quote_id, material_id)
);
CREATE INDEX idx_qpa_quote ON public.quote_pdf_attachments(quote_id);
ALTER TABLE public.quote_pdf_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qpa_sel" ON public.quote_pdf_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.company_id = public.get_my_company_id()));
CREATE POLICY "qpa_ins" ON public.quote_pdf_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.company_id = public.get_my_company_id()));
CREATE POLICY "qpa_del" ON public.quote_pdf_attachments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.company_id = public.get_my_company_id()));

-- 6. generate_quote_number() — progressive OFF-YYYY-NNN
CREATE OR REPLACE FUNCTION public.generate_quote_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM now())::TEXT;
  v_count INTEGER;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.quotes
  WHERE company_id = p_company_id
    AND quote_number LIKE 'OFF-' || v_year || '-%';

  v_number := 'OFF-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN v_number;
END;
$$;

-- 7. recalculate_quote_totals() trigger function
CREATE OR REPLACE FUNCTION public.recalculate_quote_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quote_id UUID;
  v_subtotal NUMERIC(12,2);
  v_vat_amount NUMERIC(12,2);
  v_discount_pct NUMERIC(5,2);
  v_discount_amt NUMERIC(12,2);
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);

  -- Calculate line totals
  UPDATE public.quote_items
  SET line_total = ROUND(quantity * unit_price * (1 - COALESCE(discount_percent, 0) / 100), 2)
  WHERE quote_id = v_quote_id;

  -- Sum up
  SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
  FROM public.quote_items WHERE quote_id = v_quote_id;

  SELECT COALESCE(discount_percent, 0) INTO v_discount_pct
  FROM public.quotes WHERE id = v_quote_id;

  v_discount_amt := ROUND(v_subtotal * v_discount_pct / 100, 2);

  SELECT COALESCE(SUM(ROUND(line_total * vat_rate / 100, 2)), 0) INTO v_vat_amount
  FROM public.quote_items WHERE quote_id = v_quote_id;

  -- Apply global discount proportionally to VAT as well
  v_vat_amount := ROUND(v_vat_amount * (1 - v_discount_pct / 100), 2);

  UPDATE public.quotes
  SET subtotal = v_subtotal,
      discount_amount = v_discount_amt,
      vat_amount = v_vat_amount,
      total = v_subtotal - v_discount_amt + v_vat_amount,
      updated_at = now()
  WHERE id = v_quote_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalculate_quote_totals
AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
FOR EACH ROW EXECUTE FUNCTION public.recalculate_quote_totals();

-- 8. updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_qpm_updated_at
BEFORE UPDATE ON public.quote_pdf_materials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
