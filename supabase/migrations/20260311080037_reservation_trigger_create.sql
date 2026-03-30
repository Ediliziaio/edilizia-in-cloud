DROP TRIGGER IF EXISTS update_reservation_on_status_change ON public.order_items;
CREATE TRIGGER update_reservation_on_status_change
  AFTER UPDATE OF status, stock_item_id ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_stock_reservation();
