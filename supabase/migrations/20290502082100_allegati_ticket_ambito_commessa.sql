-- La cartella di ogni allegato è l'ID del ticket. La lettura di tickets
-- continua ad applicare i permessi esistenti per ufficio, cantiere e cliente.
DROP POLICY IF EXISTS "ticket_attach_upload" ON storage.objects;
CREATE POLICY "ticket_attach_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments' AND EXISTS (
      SELECT 1 FROM public.tickets AS t
      WHERE t.id = CASE WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        THEN (storage.foldername(name))[1]::uuid END
    )
  );

-- L’operaio può allegare una foto al ticket che ha appena aperto da Campo.
-- Il caricamento ha un permesso dedicato perché la scheda resta in sola
-- gestione all’ufficio e la normale lettura di tickets non espone la riga.
DROP POLICY IF EXISTS "ticket_attach_upload_campo_autore" ON storage.objects;
CREATE POLICY "ticket_attach_upload_campo_autore"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND public.campo_ticket_mio(
      CASE WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        THEN (storage.foldername(name))[1]::uuid END
    )
  );

DROP POLICY IF EXISTS "ticket_attach_read" ON storage.objects;
CREATE POLICY "ticket_attach_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments' AND EXISTS (
      SELECT 1 FROM public.tickets AS t
      WHERE t.id = CASE WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        THEN (storage.foldername(name))[1]::uuid END
    )
  );
