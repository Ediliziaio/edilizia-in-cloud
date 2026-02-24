
-- Fix article_templates policies: change from public to authenticated role
DROP POLICY IF EXISTS "Company admins can manage their article templates" ON public.article_templates;
DROP POLICY IF EXISTS "Staff can manage article templates if permitted" ON public.article_templates;
DROP POLICY IF EXISTS "Staff can view article templates if permitted" ON public.article_templates;
DROP POLICY IF EXISTS "Super admins can manage all article templates" ON public.article_templates;

CREATE POLICY "Company admins can manage their article templates"
ON public.article_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can manage article templates if permitted"
ON public.article_templates FOR ALL TO authenticated
USING (has_permission(auth.uid(), 'can_edit_orders'::text) AND company_id = get_user_company_id(auth.uid()))
WITH CHECK (has_permission(auth.uid(), 'can_edit_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view article templates if permitted"
ON public.article_templates FOR SELECT TO authenticated
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all article templates"
ON public.article_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Fix order_salespeople policies: change from public to authenticated role
DROP POLICY IF EXISTS "Company admins can manage their order salespeople" ON public.order_salespeople;
DROP POLICY IF EXISTS "Salespeople can view their commissions" ON public.order_salespeople;
DROP POLICY IF EXISTS "Staff can view order salespeople if permitted" ON public.order_salespeople;
DROP POLICY IF EXISTS "Super admins can manage all order salespeople" ON public.order_salespeople;

CREATE POLICY "Company admins can manage their order salespeople"
ON public.order_salespeople FOR ALL TO authenticated
USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_salespeople.order_id AND o.company_id = get_user_company_id(auth.uid())
))
WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_salespeople.order_id AND o.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Salespeople can view their commissions"
ON public.order_salespeople FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM salespeople s WHERE s.id = order_salespeople.salesperson_id AND s.user_id = auth.uid()
));

CREATE POLICY "Staff can view order salespeople if permitted"
ON public.order_salespeople FOR SELECT TO authenticated
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_salespeople.order_id AND o.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Super admins can manage all order salespeople"
ON public.order_salespeople FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Create RPC function for plan count aggregation
CREATE OR REPLACE FUNCTION public.get_plan_company_counts()
RETURNS TABLE(subscription_plan_id uuid, company_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.subscription_plan_id, COUNT(*)::bigint
  FROM public.companies c
  WHERE c.subscription_plan_id IS NOT NULL
  GROUP BY c.subscription_plan_id;
$$;
