-- SECURITY FIX: le guardie people non filtravano multi_company_access.status.
-- Un accesso multi-azienda 'suspended' (o un invito 'invited' mai accettato)
-- continuava a vedere e — se access_role=company_admin — GESTIRE persone,
-- accessi e staff_permissions dell'azienda: la sospensione non revocava nulla.
-- Ora tutti e tre gli EXISTS richiedono status = 'active'.
-- Dati al 16/07: 2 righe totali, entrambe 'active' → zero regressioni.

CREATE OR REPLACE FUNCTION public.can_access_company_people(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p_company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND mca.status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_company_people(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND mca.access_role = 'company_admin'
        AND mca.status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_company_people(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.can_manage_company_people(p_company_id)
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      LEFT JOIN public.staff_permissions sp
        ON sp.user_id = auth.uid()
       AND sp.company_id = mca.company_id
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND mca.status = 'active'
        AND (
          COALESCE(sp.can_view_settings_people, false)
          OR COALESCE(sp.can_view_users, false)
        )
    );
$function$;
