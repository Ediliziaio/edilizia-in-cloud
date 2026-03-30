CREATE INDEX IF NOT EXISTS idx_scadenze_invoice ON public.scadenze(invoice_id) WHERE invoice_id IS NOT NULL;
