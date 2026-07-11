-- ============================================================================
-- Hardening cross-tenant RPC — Parte 1/3: helper canonico di appartenenza.
-- ----------------------------------------------------------------------------
-- Molte funzioni SECURITY DEFINER accettano un p_company_id dal client e, dentro
-- una SECURITY DEFINER, la RLS e' bypassata: il parametro era l'unica barriera e
-- mancava il controllo di appartenenza -> un qualsiasi utente autenticato poteva
-- leggere/scrivere dati di un'altra azienda passando il suo UUID.
--
-- user_can_access_company() unisce TUTTI i percorsi d'accesso legittimi
-- (azienda primaria, multi_company_access, super_admin, commercialista) piu' un
-- bypass per service_role (orchestratore Silvio / edge / cron, che chiamano con
-- la service key e per cui auth.uid() e' NULL). assert_company_access() e' il
-- guard che solleva 42501 quando l'accesso non e' consentito; viene invocato in
-- testa alle RPC (vedi parti 2 e 3).
-- ============================================================================

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
