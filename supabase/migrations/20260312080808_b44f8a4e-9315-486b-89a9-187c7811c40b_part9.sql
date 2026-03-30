-- 6. Storage policy: users can update their own avatar
DROP POLICY IF EXISTS "Users update own avatar" ON public.storage;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );
