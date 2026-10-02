-- Allegati delle risposte di Outreach: bucket privato, leggibile solo dai super admin
-- (le funzioni scrivono con la chiave di servizio). L'elenco sta in outreach_replies.raw.attachments.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('outreach-attachments', 'outreach-attachments', false, 15728640)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "outreach_attachments_super_read" ON storage.objects;
CREATE POLICY "outreach_attachments_super_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'outreach-attachments' AND public.is_super_admin());
