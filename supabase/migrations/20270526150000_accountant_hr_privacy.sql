-- Privacy HR: il commercialista NON deve vedere singoli cedolini o
-- timbrature individuali (dati sensibili di payroll). Solo aggregati.
--
-- Versione MINIMALE che funziona su qualsiasi schema: usa solo
-- company_id + created_at (sempre presenti). Per restituire totali
-- specifici (lordo, netto, ore_lavorate) servirà uno script di
-- estensione dopo aver identificato i nomi colonne reali.

-- Chiudi accesso row-level su tabelle HR sensibili
DROP POLICY IF EXISTS "hr_cedolini_accountant_select" ON public.hr_cedolini;
DROP POLICY IF EXISTS "hr_timbrature_accountant_select" ON public.hr_timbrature;

-- Vista aggregata cedolini: count per company + mese
DROP VIEW IF EXISTS public.v_accountant_hr_cedolini_aggregate CASCADE;
CREATE VIEW public.v_accountant_hr_cedolini_aggregate
WITH (security_invoker = true) AS
SELECT
  company_id,
  date_trunc('month', created_at) AS mese,
  COUNT(*) AS num_cedolini
FROM public.hr_cedolini
WHERE public.user_can_read_accountant_company(company_id)
GROUP BY company_id, date_trunc('month', created_at);

COMMENT ON VIEW public.v_accountant_hr_cedolini_aggregate IS
  'Vista aggregata cedolini per commercialista — count mensile, no dati individuali.';

GRANT SELECT ON public.v_accountant_hr_cedolini_aggregate TO authenticated;

-- Vista aggregata timbrature: count per company + mese
DROP VIEW IF EXISTS public.v_accountant_hr_timbrature_aggregate CASCADE;
CREATE VIEW public.v_accountant_hr_timbrature_aggregate
WITH (security_invoker = true) AS
SELECT
  company_id,
  date_trunc('month', created_at) AS mese,
  COUNT(*) AS num_timbrature
FROM public.hr_timbrature
WHERE public.user_can_read_accountant_company(company_id)
GROUP BY company_id, date_trunc('month', created_at);

COMMENT ON VIEW public.v_accountant_hr_timbrature_aggregate IS
  'Vista aggregata timbrature per commercialista — count mensile, no dati individuali.';

GRANT SELECT ON public.v_accountant_hr_timbrature_aggregate TO authenticated;
