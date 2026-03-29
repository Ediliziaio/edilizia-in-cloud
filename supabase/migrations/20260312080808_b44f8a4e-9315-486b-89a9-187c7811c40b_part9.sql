-- 6. Storage policy: users can update their own avatar
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );
