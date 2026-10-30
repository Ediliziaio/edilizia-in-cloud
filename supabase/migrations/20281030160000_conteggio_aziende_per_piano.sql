-- Ricostruito il 30/10/2026 dal SQL registrato in schema_migrations: la
-- migrazione era stata applicata in produzione senza il suo file, e il
-- controllo Supabase Preview si fermava. Testo identico a quello applicato.

CREATE OR REPLACE FUNCTION public.get_plan_company_counts()
 RETURNS TABLE(subscription_plan_id uuid, company_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.subscription_plan_id, COUNT(*)::bigint
  FROM public.companies c
  WHERE c.subscription_plan_id IS NOT NULL
    AND c.deleted_at IS NULL
    AND NOT COALESCE(c.is_platform_admin_company, false)
  GROUP BY c.subscription_plan_id;
END;
$function$;
