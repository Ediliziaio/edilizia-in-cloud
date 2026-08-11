-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- SECURITY (advisor materialized_view_in_api): 4 materialized view ADMIN erano
-- leggibili via REST da anon/authenticated → un utente normale poteva leggere
-- il P&L della piattaforma (superadmin_service_pnl) e il dashboard admin.
--
-- Verificato: il frontend NON legge queste MV direttamente. Sono usate solo da
-- edge function (admin-dashboard-data) che gira con service_role → service_role
-- BYPASSA i grant REST, quindi continua a funzionare normalmente.
--
-- Fix: revoca SELECT da anon + authenticated. Le MV restano accessibili a
-- service_role (edge functions) e postgres (admin).

REVOKE SELECT ON public.admin_dashboard_summary FROM anon, authenticated;
REVOKE SELECT ON public.superadmin_service_pnl FROM anon, authenticated;
REVOKE SELECT ON public.mv_cg_storico_24m FROM anon, authenticated;
REVOKE SELECT ON public.mv_analytics_sede FROM anon, authenticated;
