
-- Create storage bucket for signed PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-signed-pdfs', 'quote-signed-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for quote-signed-pdfs
CREATE POLICY "Authenticated users can upload signed pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-signed-pdfs');

CREATE POLICY "Authenticated users can read own company signed pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-signed-pdfs');

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_quotes_signature_token
ON public.quotes (signature_token)
WHERE signature_token IS NOT NULL;
