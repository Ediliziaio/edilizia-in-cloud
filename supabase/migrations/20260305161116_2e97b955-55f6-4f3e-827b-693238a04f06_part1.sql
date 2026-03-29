-- 2. RLS policies for ticket-attachments bucket
-- Allow authenticated users to upload files
CREATE POLICY "ticket_attach_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
);
