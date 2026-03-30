-- Fix infinite recursion in RLS policies
-- Root cause: orders RLS queries order_employees/order_salespeople,
-- and order_employees/order_salespeople RLS query orders → infinite loop
--
-- Fix: Create SECURITY DEFINER helper functions that bypass RLS,
-- then update the child-table policies to use these functions instead
-- of direct subqueries on orders.

-- ─── 1. Helper: get company_id of an order WITHOUT triggering orders RLS ───
DROP FUNCTION IF EXISTS public.get_order_company_id(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_order_company_id(_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.orders WHERE id = _order_id
$$;
