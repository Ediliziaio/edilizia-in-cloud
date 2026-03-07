INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-attachments', 'campaign-attachments', false);

CREATE POLICY "Auth users can upload campaign attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'campaign-attachments');
CREATE POLICY "Auth users can read campaign attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'campaign-attachments');
CREATE POLICY "Auth users can delete campaign attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'campaign-attachments');