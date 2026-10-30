-- Conteggio delle aziende per piano (elenco Piani in Fatturato): fuori le
-- aziende cancellate e quella di piattaforma, come nel dettaglio del piano
-- (PlanDetail) e nel resto dell'area admin. Prima l'elenco e il dettaglio
-- dello stesso piano potevano dare due numeri diversi.

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
