-- DAC/WAC (aziende attive 24h / 7gg) nella Dashboard Super Admin erano ROTTI:
-- useAdminDashboardData interrogava public.audit_log — una tabella INESISTENTE →
-- la query andava in errore, inghiottito da Promise.allSettled → DAC e WAC sempre 0
-- (anche con attività reale in corso). Valori reali: 4 aziende attive.
--
-- Questa RPC restituisce le aziende (escluse le platform-admin) realmente attive da
-- p_since, basandosi su user_sessions.last_active_at (attività reale in app).
-- SECURITY DEFINER per leggere tutte le sessioni oltre l'RLS.
-- Il frontend ora chiama get_active_companies(oneDayAgo) e (sevenDaysAgo).
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
