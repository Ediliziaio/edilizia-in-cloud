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

-- Some views were created later than this recovered historical timestamp.
-- Revoke existing ones now; every later CREATE also closes access below.
DO $$ DECLARE v text; BEGIN
 FOREACH v IN ARRAY ARRAY['admin_dashboard_summary','superadmin_service_pnl','mv_cg_storico_24m','mv_analytics_sede'] LOOP
  IF to_regclass('public.'||v) IS NOT NULL THEN
   EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated',v);
   EXECUTE format('GRANT SELECT ON public.%I TO service_role',v);
  END IF;
 END LOOP;
END $$;
