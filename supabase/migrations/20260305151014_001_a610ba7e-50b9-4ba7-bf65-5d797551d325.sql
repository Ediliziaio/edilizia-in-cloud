-- 2. Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload order attachments" ON storage.objects;
