DROP POLICY IF EXISTS "qpa_del" ON public.quote_pdf_attachments;
CREATE POLICY "qpa_del" ON public.quote_pdf_attachments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.company_id = public.get_my_company_id()));
