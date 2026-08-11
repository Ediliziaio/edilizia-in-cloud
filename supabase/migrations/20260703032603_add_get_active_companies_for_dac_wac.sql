-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- DAC/WAC (aziende attive 24h/7gg) nella dashboard admin erano rotti: il frontend
-- interrogava public.audit_log, tabella INESISTENTE → query in errore inghiottita da
-- allSettled → sempre 0. Questa RPC restituisce le aziende (non platform-admin)
-- realmente attive da p_since, basandosi su user_sessions.last_active_at (attività
-- reale). SECURITY DEFINER per leggere tutte le sessioni oltre l'RLS.
CREATE OR REPLACE FUNCTION public.get_active_companies(p_since timestamptz)
 RETURNS TABLE(company_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT us.company_id
  FROM public.user_sessions us
  JOIN public.companies c ON c.id = us.company_id
  WHERE us.company_id IS NOT NULL
    AND us.last_active_at >= p_since
    AND COALESCE(c.is_platform_admin_company, false) = false;
$function$;
