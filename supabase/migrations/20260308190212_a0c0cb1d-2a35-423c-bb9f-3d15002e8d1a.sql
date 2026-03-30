ALTER TABLE public.company_costs DROP CONSTRAINT IF EXISTS company_costs_unique_name_date,
  ADD CONSTRAINT company_costs_unique_name_date UNIQUE (company_id, name, due_date);