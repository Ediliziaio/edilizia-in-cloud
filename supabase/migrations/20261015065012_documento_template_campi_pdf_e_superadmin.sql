SET lock_timeout = '5s';
ALTER TABLE public.documento_template_fields
  ADD COLUMN posizioni_pdf jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(posizioni_pdf) = 'array');
CREATE UNIQUE INDEX documento_template_fields_nome_unique
  ON public.documento_template_fields(template_id, nome);

CREATE POLICY doc_templates_super_admin_manage
ON public.documento_templates FOR ALL TO authenticated
USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY doc_fields_super_admin_manage
ON public.documento_template_fields FOR ALL TO authenticated
USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY doc_sessioni_super_admin_manage
ON public.documento_sessioni FOR ALL TO authenticated
USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));

-- A field cannot point to a template belonging to another company, even when
-- inserted by a privileged client. Existing valid rows are unchanged.
ALTER TABLE public.documento_templates
  ADD CONSTRAINT documento_templates_id_company_unique UNIQUE(id, company_id);
ALTER TABLE public.documento_template_fields
  ADD CONSTRAINT documento_fields_template_company_fk
  FOREIGN KEY(template_id, company_id)
  REFERENCES public.documento_templates(id, company_id) ON DELETE CASCADE;

-- Only the uploading user can clean up their own orphaned file after a failed
-- registry insert. Restrictive tenant guards from the previous migration apply.
CREATE POLICY documento_templates_cleanup_own_upload
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documento-templates'
  AND owner_id = (SELECT auth.uid())::text
  AND NOT (SELECT public.utente_bloccato())
  AND NOT (SELECT public.utente_e_cliente_esterno())
  AND ((SELECT public.is_super_admin())
    OR split_part(name, '/', 1) = (SELECT public.get_my_company_id())::text));
