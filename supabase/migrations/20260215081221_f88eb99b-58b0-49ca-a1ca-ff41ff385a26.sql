
-- Add vat_rate and supplier_id columns to company_costs
ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 22,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Create index for supplier_id lookups
CREATE INDEX IF NOT EXISTS idx_company_costs_supplier_id ON public.company_costs(supplier_id);
