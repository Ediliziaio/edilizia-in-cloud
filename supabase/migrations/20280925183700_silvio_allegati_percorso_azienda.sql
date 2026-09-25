-- Allegati di Silvio: il percorso <azienda>/<utente>/<file> era rifiutato.
--
-- La pagina Silvio AI e il pannello laterale di Silvio caricano in
-- `silvio-uploads` con il percorso documentato nel codice,
-- `<company_id>/<user_id>/<timestamp>-<nome>`, e l'estrazione dei PDF
-- (`silvio-extract-pdf`) accetta solo percorsi che iniziano con l'azienda.
-- Le policy sul bucket, invece, volevano l'utente come PRIMA cartella: ogni
-- caricamento dalla pagina di Silvio finiva in «new row violates row-level
-- security policy» (403). Nel bucket, il 25/09/2026, c'erano 3 file in tutto,
-- l'ultimo di maggio: nessun contratto, DDT o foto era mai arrivato a Silvio da
-- lì.
--
-- Resta valido il vecchio percorso <user_id>/<file> (lo usa la chat del team).
-- Il nuovo è ammesso solo se la seconda cartella è chi carica e se l'utente
-- può accedere all'azienda della prima (azienda principale, accesso
-- multi-azienda attivo, commercialista, super admin: user_can_access_company).
-- Il CASE evita il cast a uuid di una cartella che uuid non è.

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

-- Lettura: serve al browser per il link firmato dell'anteprima dell'allegato.
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
