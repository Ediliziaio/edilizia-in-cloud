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
