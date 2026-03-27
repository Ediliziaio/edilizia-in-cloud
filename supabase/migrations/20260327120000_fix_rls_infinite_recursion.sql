-- Fix infinite recursion in RLS policies
-- Root cause: orders RLS queries order_employees/order_salespeople,
-- and order_employees/order_salespeople RLS query orders → infinite loop
--
-- Fix: Create SECURITY DEFINER helper functions that bypass RLS,
-- then update the child-table policies to use these functions instead
-- of direct subqueries on orders.

-- ─── 1. Helper: get company_id of an order WITHOUT triggering orders RLS ───
CREATE OR REPLACE FUNCTION public.get_order_company_id(_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.orders WHERE id = _order_id
$$;

-- ─── 2. Fix order_employees policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "Company admins can manage their order employees"    ON public.order_employees;
DROP POLICY IF EXISTS "Staff can view order employees if permitted"         ON public.order_employees;
DROP POLICY IF EXISTS "Employees can view their own order assignments"      ON public.order_employees;

-- Company admins: use SECURITY DEFINER function to get order company_id
CREATE POLICY "Company admins can manage their order employees"
ON public.order_employees FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_employees.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_employees.order_id) = public.get_user_company_id(auth.uid())
);

-- Staff: use SECURITY DEFINER function
CREATE POLICY "Staff can view order employees if permitted"
ON public.order_employees FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_employees.order_id) = public.get_user_company_id(auth.uid())
);

-- Employees can see their own assignments
CREATE POLICY "Employees can view their own order assignments"
ON public.order_employees FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = order_employees.employee_id
      AND e.user_id = auth.uid()
  )
);

-- ─── 3. Fix order_salespeople policies ───────────────────────────────────────

DROP POLICY IF EXISTS "Company admins can manage their order salespeople"   ON public.order_salespeople;
DROP POLICY IF EXISTS "Staff can view order salespeople if permitted"        ON public.order_salespeople;
DROP POLICY IF EXISTS "Salespeople can view their commissions"               ON public.order_salespeople;

-- Company admins: use SECURITY DEFINER function
CREATE POLICY "Company admins can manage their order salespeople"
ON public.order_salespeople FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_salespeople.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_salespeople.order_id) = public.get_user_company_id(auth.uid())
);

-- Staff: use SECURITY DEFINER function
CREATE POLICY "Staff can view order salespeople if permitted"
ON public.order_salespeople FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_salespeople.order_id) = public.get_user_company_id(auth.uid())
);

-- Salespeople see their own commissions (no orders reference → no recursion)
CREATE POLICY "Salespeople can view their commissions"
ON public.order_salespeople FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.salespeople s
    WHERE s.id = order_salespeople.salesperson_id
      AND s.user_id = auth.uid()
  )
);

-- ─── 4. Fix order_items policies ─────────────────────────────────────────────
-- These also have direct orders subqueries that could cause issues

DROP POLICY IF EXISTS "Company admins can manage their order items"         ON public.order_items;
DROP POLICY IF EXISTS "Customers can view their order items"                 ON public.order_items;
DROP POLICY IF EXISTS "Staff can view order items if permitted"              ON public.order_items;
DROP POLICY IF EXISTS "Employees can view items of their assigned orders"    ON public.order_items;

-- Company admins
CREATE POLICY "Company admins can manage their order items"
ON public.order_items FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_items.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_items.order_id) = public.get_user_company_id(auth.uid())
);

-- Customers can view their own order items
CREATE OR REPLACE FUNCTION public.get_order_customer_id(_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.orders WHERE id = _order_id
$$;

CREATE POLICY "Customers can view their order items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  public.get_order_customer_id(order_items.order_id) = auth.uid()
);

-- Staff with permission
CREATE POLICY "Staff can view order items if permitted"
ON public.order_items FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_items.order_id) = public.get_user_company_id(auth.uid())
);

-- Employees see items of orders they are assigned to
CREATE POLICY "Employees can view items of their assigned orders"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.order_employees oe
    JOIN public.employees e ON e.id = oe.employee_id
    WHERE oe.order_id = order_items.order_id
      AND e.user_id = auth.uid()
  )
);

-- ─── 5. Also fix order_status_history if it has the same pattern ─────────────
DROP POLICY IF EXISTS "Company admins can manage their order history"       ON public.order_status_history;
DROP POLICY IF EXISTS "Staff can view order status history if permitted"     ON public.order_status_history;

CREATE POLICY "Company admins can manage their order history"
ON public.order_status_history FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_status_history.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_status_history.order_id) = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Staff can view order status history if permitted"
ON public.order_status_history FOR SELECT
TO authenticated
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND public.get_order_company_id(order_status_history.order_id) = public.get_user_company_id(auth.uid())
);
