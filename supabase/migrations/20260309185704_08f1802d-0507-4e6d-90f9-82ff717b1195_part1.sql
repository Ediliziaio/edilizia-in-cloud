-- Indici scadenze
CREATE INDEX IF NOT EXISTS idx_scadenze_company_id ON public.scadenze(company_id);
