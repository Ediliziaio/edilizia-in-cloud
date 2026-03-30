-- 5. DELETE policy — tenant-scoped
DROP POLICY IF EXISTS "Company users can delete own order attachments" ON storage.objects;
CREATE POLICY "Company users can delete own order attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'order-attachments'
  AND (
    EXISTS (
      SELECT 1
      FROM public.order_attachments oa
      JOIN public.orders o ON o.id = oa.order_id
      JOIN public.profiles p ON p.company_id = o.company_id
      WHERE p.id = auth.uid()
        AND oa.file_url = name
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
);
