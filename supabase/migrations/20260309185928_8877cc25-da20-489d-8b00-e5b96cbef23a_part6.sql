CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(company_id, status);
