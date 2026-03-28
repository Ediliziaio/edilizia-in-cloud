-- Public read for quote-pdfs via signature token (anon can download shared PDFs)
CREATE POLICY "qp_anon_sel" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'quote-pdfs');
