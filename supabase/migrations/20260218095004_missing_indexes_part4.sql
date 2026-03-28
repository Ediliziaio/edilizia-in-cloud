-- company_costs(company_id, due_date) — indice composto per i filtri
-- più comuni: "dammi i costi di questa azienda per questo periodo"
-- (useCompanyCostsData ordina per due_date, useCashFlowData filtra
--  per company_id + due_date range)
CREATE INDEX IF NOT EXISTS idx_company_costs_company_due_date
  ON public.company_costs(company_id, due_date);
