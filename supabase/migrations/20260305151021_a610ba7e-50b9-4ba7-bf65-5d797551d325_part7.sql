-- 4. SELECT policy — tenant-scoped: user must belong to the company that owns the order
DROP POLICY IF EXISTS "Company users can view own order attachments" ON public.storage;
CREATE POLICY "Company users can view own order attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'order-attachments'
  AND (
    -- Extract order_id from path: orders/{order_id}/...
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
