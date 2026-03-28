-- Indice per filtro attivi
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(company_id, is_active);
