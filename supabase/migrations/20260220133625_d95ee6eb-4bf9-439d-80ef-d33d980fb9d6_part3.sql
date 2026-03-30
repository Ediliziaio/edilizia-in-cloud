DROP POLICY IF EXISTS "Staff can view order errors if permitted" ON public.order_errors;
CREATE POLICY "Staff can view order errors if permitted"
ON public.order_errors
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
);
