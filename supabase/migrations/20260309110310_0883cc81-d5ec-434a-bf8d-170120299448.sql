
-- Storage RLS policies for quote-materials bucket
CREATE POLICY "Authenticated users can upload quote materials"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-materials');

CREATE POLICY "Authenticated users can read quote materials"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-materials');

CREATE POLICY "Authenticated users can delete quote materials"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-materials');

CREATE POLICY "Authenticated users can update quote materials"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-materials');

-- Storage RLS policies for quote-pdfs bucket
CREATE POLICY "Authenticated users can upload quote pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-pdfs');

CREATE POLICY "Authenticated users can read quote pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-pdfs');

CREATE POLICY "Authenticated users can delete quote pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-pdfs');

CREATE POLICY "Authenticated users can update quote pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-pdfs');

-- Trigger to auto-calculate expires_at from validity_days
CREATE OR REPLACE FUNCTION public.calculate_quote_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.validity_days IS NOT NULL THEN
    NEW.expires_at = NOW() + (NEW.validity_days * INTERVAL '1 day');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_quote_expires_at
BEFORE INSERT OR UPDATE OF validity_days ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.calculate_quote_expires_at();
