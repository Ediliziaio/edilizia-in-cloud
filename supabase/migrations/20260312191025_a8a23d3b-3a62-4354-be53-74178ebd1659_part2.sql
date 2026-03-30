-- RLS for documenti-fiscali bucket
DROP POLICY IF EXISTS "Company users can read own docs" ON public.storage;
CREATE POLICY "Company users can read own docs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documenti-fiscali' AND (storage.foldername(name))[1] = (SELECT id::text FROM companies WHERE id = public.get_my_company_id()));
