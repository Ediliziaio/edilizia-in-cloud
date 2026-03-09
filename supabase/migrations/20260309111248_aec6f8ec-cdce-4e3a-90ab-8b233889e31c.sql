
-- Drop the 8 broad storage policies from the second migration
DROP POLICY IF EXISTS "Authenticated users can upload quote materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read quote materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete quote materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update quote materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload quote pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read quote pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete quote pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update quote pdfs" ON storage.objects;

-- Add company-scoped UPDATE policies (missing from the first migration)
CREATE POLICY "qm_upd" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = ((auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')));

CREATE POLICY "qp_upd" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = ((auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')));
