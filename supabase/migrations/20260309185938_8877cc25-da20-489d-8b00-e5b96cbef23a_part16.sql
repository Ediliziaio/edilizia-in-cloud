-- Indici purchase_order_items
CREATE INDEX IF NOT EXISTS idx_poi_company ON public.purchase_order_items(company_id);
