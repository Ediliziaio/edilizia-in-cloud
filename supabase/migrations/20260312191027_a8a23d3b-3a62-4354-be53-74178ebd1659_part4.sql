-- RLS for fatture-xml bucket
DROP POLICY IF EXISTS "Company users can read own xml" ON storage.objects;
CREATE POLICY "Company users can read own xml" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fatture-xml' AND (storage.foldername(name))[1] = (SELECT id::text FROM companies WHERE id = public.get_my_company_id()));
