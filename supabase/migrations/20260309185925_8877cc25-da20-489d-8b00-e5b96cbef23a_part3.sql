-- Constraint unico per numerazione OdA per azienda
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS uq_oda_number_company,
  ADD CONSTRAINT uq_oda_number_company UNIQUE (company_id, oda_number);
