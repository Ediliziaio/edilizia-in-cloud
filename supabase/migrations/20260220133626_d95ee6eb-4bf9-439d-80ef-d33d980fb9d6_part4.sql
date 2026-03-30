DROP POLICY IF EXISTS "Super admins can manage all order errors" ON public.order_errors;
CREATE POLICY "Super admins can manage all order errors"
ON public.order_errors
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
