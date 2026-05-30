-- Hardening (QA SA-INTEL/PROBLEMS): le funzioni di calcolo/fan-out NON devono essere
-- chiamabili da anon/authenticated. Sono invocate solo dal cron e dal worker (service_role).
-- Nessuna esposizione dati: le tabelle sottostanti sono RLS super_admin.
REVOKE EXECUTE ON FUNCTION public.sa_compute_company_intel(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_aggregate_company_problems(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_aggregate_all_problems() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_compute_company_intel(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sa_aggregate_company_problems(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sa_aggregate_all_problems() TO service_role;
