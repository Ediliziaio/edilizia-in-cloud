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
