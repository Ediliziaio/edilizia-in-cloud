CREATE OR REPLACE FUNCTION public.trg_auto_deduct_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'installato' AND OLD.status IS DISTINCT FROM 'installato'
     AND NEW.auto_deducted IS NOT TRUE AND NEW.stock_item_id IS NOT NULL THEN
    UPDATE warehouse_stock SET quantity = GREATEST(quantity - COALESCE(NEW.quantity,1), 0), updated_at = now() WHERE id = NEW.stock_item_id;
    INSERT INTO warehouse_movements (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id)
    VALUES (NEW.stock_item_id, NEW.id, 'scarico', COALESCE(NEW.quantity,1), 'Scarico automatico a installazione',
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'), NEW.order_id);
    NEW.auto_deducted := true;
  END IF;
  RETURN NEW;
END;
$$;
