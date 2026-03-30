DROP POLICY IF EXISTS "Users can manage installments for their company orders" ON public.order_installments;
CREATE POLICY "Users can manage installments for their company orders"
ON public.order_installments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.company_id = o.company_id
    WHERE o.id = order_installments.order_id
    AND p.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.company_id = o.company_id
    WHERE o.id = order_installments.order_id
    AND p.id = auth.uid()
  )
);
