
-- Create storage buckets for native billing documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documenti-fiscali', 'documenti-fiscali', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('fatture-xml', 'fatture-xml', false) ON CONFLICT (id) DO NOTHING;

-- RLS for documenti-fiscali bucket
CREATE POLICY "Company users can read own docs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documenti-fiscali' AND (storage.foldername(name))[1] = (SELECT id::text FROM companies WHERE id = public.get_my_company_id()));

CREATE POLICY "Service role can insert docs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documenti-fiscali');

-- RLS for fatture-xml bucket
CREATE POLICY "Company users can read own xml" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fatture-xml' AND (storage.foldername(name))[1] = (SELECT id::text FROM companies WHERE id = public.get_my_company_id()));

CREATE POLICY "Service role can insert xml" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fatture-xml');
