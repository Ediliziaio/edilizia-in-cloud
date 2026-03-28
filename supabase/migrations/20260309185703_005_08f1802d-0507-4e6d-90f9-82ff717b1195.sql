CREATE INDEX idx_scadenze_invoice ON public.scadenze(invoice_id) WHERE invoice_id IS NOT NULL;
