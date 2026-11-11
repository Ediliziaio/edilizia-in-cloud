-- External-customer guard required by these storage policies before its later hardening migration.
CREATE OR REPLACE FUNCTION public.utente_e_cliente_esterno()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'customer'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role <> 'customer'::public.app_role);
$function$;

COMMENT ON FUNCTION public.utente_e_cliente_esterno() IS
  'Vero quando l''utente entra solo come cliente. Serve a togliere ai clienti le policy scritte per lo staff: aggiungerne una accanto non basterebbe, perché le policy permissive si sommano in OR.';

REVOKE ALL ON FUNCTION public.utente_e_cliente_esterno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utente_e_cliente_esterno() TO authenticated, service_role;


-- Fence the legacy authenticated-wide policies. Other buckets are unchanged.
-- No new user, membership or role is created. Super admins retain their existing
-- platform-wide authority; ordinary users are limited to their selected company.
CREATE POLICY documento_templates_tenant_read_guard
ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  bucket_id <> 'documento-templates'
  OR (
    NOT (SELECT public.utente_bloccato())
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND (
      (SELECT public.is_super_admin())
      OR split_part(name, '/', 1) = (SELECT public.get_my_company_id())::text
    )
  )
);

CREATE POLICY documento_templates_tenant_upload_guard
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'documento-templates'
  OR (
    NOT (SELECT public.utente_bloccato())
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND (
      (SELECT public.is_super_admin())
      OR split_part(name, '/', 1) = (SELECT public.get_my_company_id())::text
    )
  )
);

-- Align the template registry with existing super-admin company access.
-- The restrictive blocked-user policy remains in force.
CREATE POLICY doc_templates_super_admin_read
ON public.documento_templates FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()));

CREATE POLICY doc_templates_super_admin_insert
ON public.documento_templates FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()));
