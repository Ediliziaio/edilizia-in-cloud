-- Index per query frequenti
CREATE INDEX IF NOT EXISTS idx_order_installments_order_id ON public.order_installments(order_id);
