-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Hardening (QA): le funzioni di calcolo/fan-out non devono essere chiamabili da anon/authenticated.
-- Sono invocate solo dal cron e dal worker (service_role). Nessuna esposizione dati (tabelle RLS super_admin).
REVOKE EXECUTE ON FUNCTION public.sa_compute_company_intel(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_aggregate_company_problems(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_aggregate_all_problems() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_compute_company_intel(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sa_aggregate_company_problems(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sa_aggregate_all_problems() TO service_role;
