-- 11. create_oda_from_order - Riscrittura con p_item_ids
DROP FUNCTION IF EXISTS public.create_oda_from_order(UUID, UUID, UUID, UUID[]) CASCADE;
CREATE OR REPLACE FUNCTION public.create_oda_from_order(
  p_company_id UUID,
  p_order_id UUID,
  p_supplier_id UUID,
  p_item_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id UUID;
  v_item RECORD;
BEGIN
  -- Create the purchase order (oda_number auto-assigned by trigger)
  INSERT INTO purchase_orders (company_id, supplier_id, order_id, created_by)
  VALUES (p_company_id, p_supplier_id, p_order_id, auth.uid())
  RETURNING id INTO v_po_id;

  -- Copy items (all or selected)
  FOR v_item IN
    SELECT * FROM order_items
    WHERE order_id = p_order_id
      AND (p_item_ids IS NULL OR id = ANY(p_item_ids))
  LOOP
    INSERT INTO purchase_order_items (
      company_id, purchase_order_id, order_item_id,
      description, quantity, unit_price, vat_rate, 
      discount_percent, unit_of_measure, sort_order
    ) VALUES (
      p_company_id, v_po_id, v_item.id,
      v_item.description, v_item.quantity, v_item.unit_price, 
      COALESCE(v_item.vat_rate, 22), 0, 
      COALESCE(v_item.unit_of_measure, 'pz'), v_item.sort_order
    );
    
    -- Mark order item as ordered
    UPDATE order_items SET status = 'ordinato' WHERE id = v_item.id;
  END LOOP;

  RETURN v_po_id;
END;
$$;
