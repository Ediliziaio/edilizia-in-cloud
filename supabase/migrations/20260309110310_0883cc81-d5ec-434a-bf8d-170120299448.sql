-- Storage RLS policies for quote-materials bucket
DROP POLICY IF EXISTS "Authenticated users can upload quote materials" ON storage.objects;
CREATE POLICY "Authenticated users can upload quote materials"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-materials');
