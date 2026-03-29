-- warehouse_movements.stock_item_id — usato nello storico movimenti
-- di ogni articolo; con molti movimenti diventa il collo di bottiglia
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_stock_item_id
  ON public.warehouse_movements(stock_item_id);
