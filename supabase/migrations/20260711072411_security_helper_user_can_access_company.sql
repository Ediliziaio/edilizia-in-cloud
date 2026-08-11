-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- Helper canonico di appartenenza azienda per hardening RPC SECURITY DEFINER.
-- Unisce TUTTI i percorsi d'accesso legittimi + bypass service_role (orchestratore).
CREATE OR REPLACE FUNCTION public.user_can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p_company_id IS NOT NULL
    AND (
      -- service_role (orchestratore Silvio / edge / cron) → sempre consentito
      COALESCE(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
      -- super admin
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      -- azienda primaria dell'utente
      OR p_company_id = public.get_user_company_id(auth.uid())
      -- accesso multi-azienda
      OR EXISTS (
        SELECT 1 FROM public.multi_company_access mca
        WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id
      )
      -- commercialista (studio con accesso all'azienda)
      OR public.can_accountant_access_company(p_company_id, NULL)
    );
$function$;

COMMENT ON FUNCTION public.user_can_access_company(uuid) IS
'Ritorna true se l''utente corrente puo accedere a p_company_id (azienda primaria, multi_company_access, super_admin, commercialista) o se il chiamante e service_role. Usato dal guard assert_company_access nelle RPC SECURITY DEFINER per prevenire accessi cross-tenant.';

CREATE OR REPLACE FUNCTION public.assert_company_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso non autorizzato a questa azienda'
      USING ERRCODE = '42501', HINT = 'user_can_access_company';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.user_can_access_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_company_access(uuid) TO authenticated, service_role;
