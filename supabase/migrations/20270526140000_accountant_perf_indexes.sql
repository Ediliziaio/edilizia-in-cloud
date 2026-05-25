-- Indici performance per le query del commercialista.
--
-- user_can_read_accountant_company(company_id) e
-- user_can_write_accountant_company(company_id) vengono chiamate
-- 1 volta per riga risultante. Senza indici corretti, su una tabella
-- con 50k+ righe le SELECT del commercialista diventano lente.

-- accountant_company_access: lookup per company_id + status
CREATE INDEX IF NOT EXISTS accountant_company_access_company_status_idx
  ON public.accountant_company_access (company_id, status);

-- accountant_company_access: lookup per firm_id + status (usato in JOIN)
CREATE INDEX IF NOT EXISTS accountant_company_access_firm_status_idx
  ON public.accountant_company_access (firm_id, status);

-- accountant_firm_members: lookup per user_id + status (filtro principale)
CREATE INDEX IF NOT EXISTS accountant_firm_members_user_status_idx
  ON public.accountant_firm_members (user_id, status);

-- accountant_firm_members: lookup per firm_id (usato in helper SECURITY DEFINER)
CREATE INDEX IF NOT EXISTS accountant_firm_members_firm_user_idx
  ON public.accountant_firm_members (firm_id, user_id);

-- Composito per JOIN comune access+members
-- (covering index: include status per evitare bitmap heap scan)
CREATE INDEX IF NOT EXISTS accountant_company_access_firm_company_status_idx
  ON public.accountant_company_access (firm_id, company_id, status);
