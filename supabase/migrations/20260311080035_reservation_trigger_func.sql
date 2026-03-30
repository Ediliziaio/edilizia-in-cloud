-- Reservation trigger function
CREATE OR REPLACE FUNCTION trigger_update_stock_reservation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_item_id IS NOT NULL THEN
    IF NEW.status = 'prenotato' AND (OLD.status <> 'prenotato' OR OLD.stock_item_id IS NULL) THEN
      UPDATE warehouse_stock
      SET quantity_reserved = quantity_reserved + NEW.quantity, updated_at = NOW()
      WHERE id = NEW.stock_item_id;
    ELSIF OLD.status = 'prenotato' AND NEW.status <> 'prenotato' AND OLD.stock_item_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity), updated_at = NOW()
      WHERE id = OLD.stock_item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
