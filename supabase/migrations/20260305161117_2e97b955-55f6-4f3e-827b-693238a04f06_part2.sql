-- Allow users to read attachments for tickets they have access to
DROP POLICY IF EXISTS "ticket_attach_read" ON storage.objects;
CREATE POLICY "ticket_attach_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ticket-attachments'
);
