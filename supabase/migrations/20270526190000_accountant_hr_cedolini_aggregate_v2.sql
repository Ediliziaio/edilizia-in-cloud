-- Estende v_accountant_hr_cedolini_aggregate con i veri campi di
-- hr_cedolini: anno + mese (integer), lordo, netto, contributi_dipendente,
-- ritenute_irpef, ore_lavorate, ore_straordinario, indennita_trasferta_eur,
-- stato, employee_id.
--
-- Sostituisce la vista MINIMALE (count puro) creata in
-- 20270526150000_accountant_hr_privacy.sql con una versione che
-- restituisce TOTALI MENSILI utili al commercialista per calcoli
-- payroll senza esporre singoli cedolini (privacy garantita).

DROP VIEW IF EXISTS public.v_accountant_hr_cedolini_aggregate CASCADE;

CREATE VIEW public.v_accountant_hr_cedolini_aggregate
WITH (security_invoker = true) AS
SELECT
  company_id,
  anno,
  mese,
  make_date(anno, mese, 1) AS periodo,
  COUNT(*) AS num_cedolini,
  COUNT(DISTINCT employee_id) AS num_dipendenti,
  COALESCE(SUM(lordo), 0) AS totale_lordo,
  COALESCE(SUM(netto), 0) AS totale_netto,
  COALESCE(SUM(contributi_dipendente), 0) AS totale_contributi_dipendente,
  COALESCE(SUM(ritenute_irpef), 0) AS totale_ritenute_irpef,
  COALESCE(SUM(ore_lavorate), 0) AS totale_ore_lavorate,
  COALESCE(SUM(ore_straordinario), 0) AS totale_ore_straordinario,
  COALESCE(SUM(indennita_trasferta_eur), 0) AS totale_indennita_trasferta,
  COUNT(*) FILTER (WHERE stato = 'pagato') AS num_pagati,
  COUNT(*) FILTER (WHERE stato = 'bozza') AS num_bozze
FROM public.hr_cedolini
WHERE public.user_can_read_accountant_company(company_id)
GROUP BY company_id, anno, mese;

COMMENT ON VIEW public.v_accountant_hr_cedolini_aggregate IS
  'Vista aggregata cedolini per commercialista — totali mensili (lordo/netto/contributi/IRPEF/ore) + count dipendenti. No payslip individuali.';

GRANT SELECT ON public.v_accountant_hr_cedolini_aggregate TO authenticated;
