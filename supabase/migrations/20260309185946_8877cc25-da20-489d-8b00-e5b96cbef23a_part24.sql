-- =============================================
-- 2D. TRIGGER: Ricalcolo totali OdA
-- =============================================
DROP FUNCTION IF EXISTS public.recalc_purchase_order_totals() CASCADE;
CREATE OR REPLACE FUNCTION public.recalc_purchase_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  UPDATE purchase_orders SET
    subtotal = COALESCE((SELECT SUM(line_total) FROM purchase_order_items WHERE purchase_order_id = v_po_id), 0),
    vat_total = COALESCE((SELECT SUM(vat_amount) FROM purchase_order_items WHERE purchase_order_id = v_po_id), 0),
    total = COALESCE((SELECT SUM(line_total + vat_amount) FROM purchase_order_items WHERE purchase_order_id = v_po_id), 0),
    updated_at = now()
  WHERE id = v_po_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
