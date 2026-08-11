-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


CREATE OR REPLACE FUNCTION public.user_can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    p_company_id IS NOT NULL
    AND (
      COALESCE(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR p_company_id = public.get_user_company_id(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.multi_company_access mca
        WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id
      )
      OR public.can_accountant_access_company(p_company_id, NULL)
    ),
  false);
$function$;
