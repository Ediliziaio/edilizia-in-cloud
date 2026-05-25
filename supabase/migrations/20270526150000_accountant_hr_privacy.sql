-- Privacy HR: il commercialista deve poter vedere TOTALI aggregati
-- (costo personale mensile, ore lavorate) ma NON i singoli cedolini
-- né le singole timbrature individuali.
--
-- Strategia:
--   1. Rimuovere le policy "<table>_accountant_select" su hr_cedolini
--      e hr_timbrature (chiudi accesso row-level)
--   2. Creare 2 viste aggregate accessibili tramite RLS

-- 1) REVOKE delle policy granulari precedenti su HR sensibili
DROP POLICY IF EXISTS "hr_cedolini_accountant_select" ON public.hr_cedolini;
DROP POLICY IF EXISTS "hr_timbrature_accountant_select" ON public.hr_timbrature;
-- employees rimane accessibile (anagrafica base, no stipendi)

-- 2) VISTA aggregata cedolini per (company, periodo)
CREATE OR REPLACE VIEW public.v_accountant_hr_cedolini_aggregate
WITH (security_invoker = true)
AS
SELECT
  company_id,
  date_trunc('month', periodo_inizio) AS mese,
  COUNT(*) AS num_cedolini,
  SUM(COALESCE(totale_lordo, 0)) AS totale_lordo,
  SUM(COALESCE(totale_netto, 0)) AS totale_netto,
  SUM(COALESCE(contributi_carico_azienda, 0)) AS contributi_azienda,
  SUM(COALESCE(contributi_carico_dipendente, 0)) AS contributi_dipendente
FROM public.hr_cedolini
WHERE public.user_can_read_accountant_company(company_id)
GROUP BY company_id, date_trunc('month', periodo_inizio);

COMMENT ON VIEW public.v_accountant_hr_cedolini_aggregate IS
  'Vista aggregata cedolini per commercialista — totali mensili senza dati dipendente individuale (privacy).';

GRANT SELECT ON public.v_accountant_hr_cedolini_aggregate TO authenticated;

-- 3) VISTA aggregata timbrature per (company, periodo, employee_count)
CREATE OR REPLACE VIEW public.v_accountant_hr_timbrature_aggregate
WITH (security_invoker = true)
AS
SELECT
  company_id,
  date_trunc('month', data_timbratura) AS mese,
  COUNT(*) AS num_timbrature,
  COUNT(DISTINCT employee_id) AS num_dipendenti_attivi,
  SUM(COALESCE(ore_lavorate, 0)) AS totale_ore_lavorate
FROM public.hr_timbrature
WHERE public.user_can_read_accountant_company(company_id)
GROUP BY company_id, date_trunc('month', data_timbratura);

COMMENT ON VIEW public.v_accountant_hr_timbrature_aggregate IS
  'Vista aggregata timbrature per commercialista — ore totali e count dipendenti senza identificare singolo individuo.';

GRANT SELECT ON public.v_accountant_hr_timbrature_aggregate TO authenticated;

-- NOTE: il company_admin/owner mantiene piena visibilità su hr_cedolini e
-- hr_timbrature tramite le policy esistenti (non toccate qui).
-- Le viste sopra sono accessibili anche all'azienda owner ma forniscono
-- comunque solo aggregati: chi vuole il singolo cedolino usa la tabella
-- diretta hr_cedolini con la propria policy company_admin.
