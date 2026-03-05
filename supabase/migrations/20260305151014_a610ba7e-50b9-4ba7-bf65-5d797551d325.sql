
-- 1. Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'order-attachments';

-- 2. Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can view order attachments" ON storage.objects;

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

-- 4. SELECT policy — tenant-scoped: user must belong to the company that owns the order
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

-- 5. DELETE policy — tenant-scoped
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
