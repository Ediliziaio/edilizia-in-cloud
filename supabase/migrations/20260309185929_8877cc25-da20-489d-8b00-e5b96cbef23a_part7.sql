CREATE INDEX IF NOT EXISTS idx_po_order ON public.purchase_orders(order_id) WHERE order_id IS NOT NULL;
