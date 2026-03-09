
-- Create storage bucket for prima nota attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prima-nota-attachments',
  'prima-nota-attachments',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket
CREATE POLICY "Authenticated users can upload prima nota attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'prima-nota-attachments');

CREATE POLICY "Authenticated users can read prima nota attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'prima-nota-attachments');

CREATE POLICY "Authenticated users can delete prima nota attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'prima-nota-attachments');
