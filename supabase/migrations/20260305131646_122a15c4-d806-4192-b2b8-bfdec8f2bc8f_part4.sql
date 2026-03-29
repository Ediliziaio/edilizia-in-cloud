-- Super admin bypass
CREATE POLICY "Super admins can manage all installments"
ON public.order_installments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
