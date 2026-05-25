-- Estende v_accountant_hr_timbrature_aggregate con i veri campi di
-- hr_timbrature: data_evento (date), profilo_id, validata.
--
-- Sostituisce la vista MINIMALE (count puro) creata in
-- 20270526150000_accountant_hr_privacy.sql con una versione più
-- ricca utile al commercialista per analisi mensile.

DROP VIEW IF EXISTS public.v_accountant_hr_timbrature_aggregate CASCADE;

CREATE VIEW public.v_accountant_hr_timbrature_aggregate
WITH (security_invoker = true) AS
SELECT
  company_id,
  date_trunc('month', data_evento)::date AS mese,
  COUNT(*) AS num_timbrature,
  COUNT(DISTINCT profilo_id) AS num_dipendenti_attivi,
  COUNT(*) FILTER (WHERE validata = true) AS num_timbrature_validate,
  MIN(data_evento) AS prima_data,
  MAX(data_evento) AS ultima_data
FROM public.hr_timbrature
WHERE public.user_can_read_accountant_company(company_id)
GROUP BY company_id, date_trunc('month', data_evento)::date;

COMMENT ON VIEW public.v_accountant_hr_timbrature_aggregate IS
  'Vista aggregata timbrature per commercialista — count mensile, dipendenti distinti, validate. No dati individuali.';

GRANT SELECT ON public.v_accountant_hr_timbrature_aggregate TO authenticated;
