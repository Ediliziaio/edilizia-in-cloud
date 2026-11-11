-- Rilievi FV privati: nessuna lettura anonima, niente accesso tra aziende.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('fv-rilievi','fv-rilievi',false,104857600)
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fv_rilievi_accesso(nome text, modifica boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT CASE
 WHEN auth.uid() IS NULL OR nome !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(assets/[a-f0-9]{64}|rilievi/[a-zA-Z0-9_-]{1,80}\.json)$' THEN false
 ELSE NOT (SELECT utente_bloccato()) AND NOT (SELECT utente_e_cliente_esterno())
 AND ((SELECT has_role(auth.uid(),'super_admin'::app_role))
 OR split_part(nome,'/',1)::uuid=ANY(aziende_con_permesso(CASE WHEN modifica THEN 'can_edit_preventivi' ELSE 'can_view_preventivi' END))) END
$$;
REVOKE ALL ON FUNCTION public.fv_rilievi_accesso(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fv_rilievi_accesso(text,boolean) TO authenticated,service_role;

DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_read') THEN
  CREATE POLICY fv_rilievi_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='fv-rilievi' AND public.fv_rilievi_accesso(name,false));
 END IF;
END $migrazione$;
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_insert') THEN
  CREATE POLICY fv_rilievi_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='fv-rilievi' AND public.fv_rilievi_accesso(name,true));
 END IF;
END $migrazione$;
-- Le guardie impediscono che altre policy Storage permissive aprano questo bucket.
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_read_guard') THEN
  CREATE POLICY fv_rilievi_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING(bucket_id<>'fv-rilievi' OR public.fv_rilievi_accesso(name,false));
 END IF;
END $migrazione$;
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_insert_guard') THEN
  CREATE POLICY fv_rilievi_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(bucket_id<>'fv-rilievi' OR public.fv_rilievi_accesso(name,true));
 END IF;
END $migrazione$;
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_anon_read') THEN
  CREATE POLICY fv_rilievi_anon_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'fv-rilievi');
 END IF;
END $migrazione$;
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_anon_insert') THEN
  CREATE POLICY fv_rilievi_anon_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon WITH CHECK(bucket_id<>'fv-rilievi');
 END IF;
END $migrazione$;
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_immutable') THEN
  CREATE POLICY fv_rilievi_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated,anon
USING(bucket_id<>'fv-rilievi') WITH CHECK(bucket_id<>'fv-rilievi');
 END IF;
END $migrazione$;
DO $migrazione$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fv_rilievi_preserve') THEN
  CREATE POLICY fv_rilievi_preserve ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated,anon USING(bucket_id<>'fv-rilievi');
 END IF;
END $migrazione$;
