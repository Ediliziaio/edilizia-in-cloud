-- Indici purchase_orders
CREATE INDEX IF NOT EXISTS idx_po_company_id ON public.purchase_orders(company_id);
