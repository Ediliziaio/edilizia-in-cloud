-- Storage policy: company-scoped access
DROP POLICY IF EXISTS "kb_storage_company_access" ON storage.objects;
CREATE POLICY "kb_storage_company_access" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'ai-knowledge'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'ai-knowledge'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
  );
