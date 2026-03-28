-- 4. Storage policy: anyone can read avatars (public bucket)
CREATE POLICY "Public avatar read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
