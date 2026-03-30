-- 5. Storage policy: authenticated users can upload their own avatar
DROP POLICY IF EXISTS "Users upload own avatar" ON public.storage;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );
