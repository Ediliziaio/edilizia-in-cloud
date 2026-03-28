CREATE POLICY "qpa_sel" ON public.quote_pdf_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.company_id = public.get_my_company_id()));
