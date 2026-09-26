-- Allegati di Silvio nella cartella dell'azienda (applicata il 25/09/2026).
--
-- File ricostruito il 25/09/2026 da supabase_migrations.schema_migrations.statements:
-- la migrazione era stata applicata via MCP senza salvare il file, e Supabase
-- Preview era rosso («Remote migration versions not found»). Il testo qui sotto
-- è identico a quello registrato nel database.

DROP POLICY IF EXISTS silvio_uploads_company_insert ON storage.objects;
CREATE POLICY silvio_uploads_company_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'silvio-uploads'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR (
        (storage.foldername(name))[2] = (auth.uid())::text
        AND CASE
          WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.user_can_access_company(((storage.foldername(name))[1])::uuid)
          ELSE false
        END
      )
    )
  );

DROP POLICY IF EXISTS silvio_uploads_owner_read ON storage.objects;
CREATE POLICY silvio_uploads_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'silvio-uploads'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR (
        (storage.foldername(name))[2] = (auth.uid())::text
        AND CASE
          WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.user_can_access_company(((storage.foldername(name))[1])::uuid)
          ELSE false
        END
      )
    )
  );
