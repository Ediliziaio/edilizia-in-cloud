DROP POLICY IF EXISTS "qpa_ins" ON public.quote_pdf_attachments;
CREATE POLICY "qpa_ins" ON public.quote_pdf_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.company_id = public.get_my_company_id()));
