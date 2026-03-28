-- order_items.stock_item_id — usato in ogni UPDATE magazzino che
-- scarica un articolo (JOIN tra order_items e warehouse_stock)
CREATE INDEX IF NOT EXISTS idx_order_items_stock_item_id
  ON public.order_items(stock_item_id);
