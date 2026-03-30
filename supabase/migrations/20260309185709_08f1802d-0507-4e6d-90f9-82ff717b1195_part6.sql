CREATE INDEX IF NOT EXISTS idx_scadenze_supplier ON public.scadenze(supplier_id) WHERE supplier_id IS NOT NULL;
