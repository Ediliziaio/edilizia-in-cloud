-- Fix order_salespeople policies: change from public to authenticated role
DROP POLICY IF EXISTS "Company admins can manage their order salespeople" ON public.order_salespeople;
