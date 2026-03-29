-- Drop the 8 broad storage policies from the second migration
DROP POLICY IF EXISTS "Authenticated users can upload quote materials" ON storage.objects;
