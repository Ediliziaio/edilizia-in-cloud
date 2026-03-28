-- 3. INSERT policy — authenticated users of the same company can upload
CREATE POLICY "Company users can upload order attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'order-attachments'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id IS NOT NULL
  )
);
