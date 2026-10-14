-- Private template attachments only; no change to orders, approvals or quote assets.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE UNIQUE INDEX IF NOT EXISTS order_variation_templates_id_company_idx ON public.order_variation_templates(id, company_id);
CREATE TABLE IF NOT EXISTS public.order_variation_template_files (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 template_id uuid NOT NULL,
 file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 180 AND file_name ~* '\.pdf$'),
 storage_path text NOT NULL UNIQUE,
 file_size integer NOT NULL CHECK (file_size BETWEEN 5 AND 10485760),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (template_id,company_id) REFERENCES public.order_variation_templates(id,company_id) ON DELETE CASCADE,
 CHECK (storage_path = company_id::text || '/' || template_id::text || '/' || id::text || '.pdf')
);
CREATE INDEX IF NOT EXISTS variation_template_files_company_template_idx ON public.order_variation_template_files(company_id,template_id,created_at);
ALTER TABLE public.order_variation_template_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_variation_template_files FROM anon, authenticated;
GRANT SELECT, INSERT ON public.order_variation_template_files TO authenticated;
GRANT UPDATE (is_active) ON public.order_variation_template_files TO authenticated;
GRANT ALL ON public.order_variation_template_files TO service_role;
DROP POLICY IF EXISTS variation_files_read ON public.order_variation_template_files;
CREATE POLICY variation_files_read ON public.order_variation_template_files FOR SELECT TO authenticated USING (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id = order_variation_template_files.template_id AND t.company_id = order_variation_template_files.company_id));
DROP POLICY IF EXISTS variation_files_insert ON public.order_variation_template_files;
CREATE POLICY variation_files_insert ON public.order_variation_template_files FOR INSERT TO authenticated WITH CHECK (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id = order_variation_template_files.template_id AND t.company_id = order_variation_template_files.company_id) AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))) AND is_active AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id = template_id AND t.is_active));
DROP POLICY IF EXISTS variation_files_archive ON public.order_variation_template_files;
CREATE POLICY variation_files_archive ON public.order_variation_template_files FOR UPDATE TO authenticated USING (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id = order_variation_template_files.template_id AND t.company_id = order_variation_template_files.company_id) AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))) AND is_active) WITH CHECK (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id = order_variation_template_files.template_id AND t.company_id = order_variation_template_files.company_id) AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))) AND NOT is_active);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('variation-template-files','variation-template-files',false,10485760,ARRAY['application/pdf']) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='variation-template-files' AND (public OR file_size_limit IS DISTINCT FROM 10485760 OR allowed_mime_types IS DISTINCT FROM ARRAY['application/pdf'])) THEN RAISE EXCEPTION 'Existing variation bucket configuration differs'; END IF; END $$;
-- Restrictive guards prevent unrelated permissive Storage policies from widening access.
DROP POLICY IF EXISTS variation_files_storage_scope ON storage.objects;
CREATE POLICY variation_files_storage_scope ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id <> 'variation-template-files' OR (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'))
 WITH CHECK (bucket_id <> 'variation-template-files' OR (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'));
DROP POLICY IF EXISTS variation_files_storage_read ON storage.objects;
CREATE POLICY variation_files_storage_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id = 'variation-template-files' AND (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'));
DROP POLICY IF EXISTS variation_files_storage_insert_guard ON storage.objects;
CREATE POLICY variation_files_storage_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (bucket_id <> 'variation-template-files' OR (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR ((storage.foldername(name))[1] = (SELECT public.get_user_company_id((SELECT auth.uid())))::text AND (storage.foldername(name))[1] IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))::text)))));
DROP POLICY IF EXISTS variation_files_storage_insert ON storage.objects;
CREATE POLICY variation_files_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'variation-template-files' AND (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR ((storage.foldername(name))[1] = (SELECT public.get_user_company_id((SELECT auth.uid())))::text AND (storage.foldername(name))[1] IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))::text)))));
DROP POLICY IF EXISTS variation_files_storage_no_overwrite ON storage.objects;
CREATE POLICY variation_files_storage_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (bucket_id <> 'variation-template-files') WITH CHECK (bucket_id <> 'variation-template-files');
-- Only compensate an unlinked upload. Normal removal is metadata archival, never file deletion.
DROP POLICY IF EXISTS variation_files_storage_delete_guard ON storage.objects;
CREATE POLICY variation_files_storage_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING (bucket_id <> 'variation-template-files' OR ((NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR ((storage.foldername(name))[1] = (SELECT public.get_user_company_id((SELECT auth.uid())))::text AND (storage.foldername(name))[1] IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))::text)))) AND NOT EXISTS (SELECT 1 FROM public.order_variation_template_files f WHERE f.storage_path = name)));
DROP POLICY IF EXISTS variation_files_storage_compensate ON storage.objects;
CREATE POLICY variation_files_storage_compensate ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id = 'variation-template-files' AND (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND EXISTS (SELECT 1 FROM public.order_variation_templates t WHERE t.id::text = (storage.foldername(name))[2] AND t.company_id::text = (storage.foldername(name))[1] AND t.is_active) AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' AND ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR ((storage.foldername(name))[1] = (SELECT public.get_user_company_id((SELECT auth.uid())))::text AND (storage.foldername(name))[1] IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))::text)))) AND NOT EXISTS (SELECT 1 FROM public.order_variation_template_files f WHERE f.storage_path = name));

DROP POLICY IF EXISTS variation_files_storage_anon_guard ON storage.objects;
CREATE POLICY variation_files_storage_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING (bucket_id <> 'variation-template-files') WITH CHECK (bucket_id <> 'variation-template-files');
