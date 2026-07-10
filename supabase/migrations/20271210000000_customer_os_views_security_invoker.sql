-- ============================================================================
-- FIX SICUREZZA: customer_profile + customer_workflow_daily_stats erano viste
-- "plain" (eseguite coi privilegi dell'owner postgres → RLS delle tabelle
-- sottostanti BYPASSATA) con GRANT SELECT a authenticated: qualsiasi utente
-- tenant loggato poteva leggere via PostgREST i dati di TUTTE le aziende
-- (ragione sociale, email, telefono, piano e prezzo/MRR, health score, NPS,
-- team size) e le statistiche/costi dei workflow AI interni.
--
-- security_invoker=true fa valere le RLS del chiamante:
--   • super_admin vede tutto (tutte le tabelle sottostanti hanno la policy
--     has_role(super_admin): product_events, customer_interactions,
--     customer_health_history, customer_onboarding, customer_usage_daily,
--     nps_responses, customer_workflow_runs);
--   • un utente tenant vede solo la propria azienda (policy company_read_own).
-- get_customer_context (SECURITY DEFINER, con gate esplicito super_admin/
-- own-company) e le edge function service_role NON sono impattate.
-- ============================================================================
ALTER VIEW public.customer_profile SET (security_invoker = true);
ALTER VIEW public.customer_workflow_daily_stats SET (security_invoker = true);
