-- 7. Storage policy: users can delete their own avatar
DROP POLICY IF EXISTS "Users delete own avatar" ON public.storage;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );
