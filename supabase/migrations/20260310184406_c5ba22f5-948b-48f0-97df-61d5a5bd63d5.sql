
CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status_id uuid,
  p_changed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET current_status_id = p_new_status_id,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, status_id, changed_by)
  VALUES (p_order_id, p_new_status_id, p_changed_by);
END;
$$;
