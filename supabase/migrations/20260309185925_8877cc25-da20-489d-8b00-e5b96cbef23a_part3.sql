-- Constraint unico per numerazione OdA per azienda
ALTER TABLE public.purchase_orders ADD CONSTRAINT uq_oda_number_company UNIQUE (company_id, oda_number);
