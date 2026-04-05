-- Storage buckets for Area Campo
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('campo-rapportini', 'campo-rapportini', true),
  ('campo-firme', 'campo-firme', true),
  ('documenti-sub', 'documenti-sub', true),
  ('documenti-dipendenti', 'documenti-dipendenti', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$ BEGIN
  CREATE POLICY "campo_rapportini_upload" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'campo-rapportini' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "campo_rapportini_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'campo-rapportini' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "campo_firme_upload" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'campo-firme' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "campo_firme_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'campo-firme' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "documenti_sub_owner" ON storage.objects FOR ALL
    USING (bucket_id = 'documenti-sub' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'documenti-sub' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "documenti_dipendenti_owner" ON storage.objects FOR ALL
    USING (bucket_id = 'documenti-dipendenti' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'documenti-dipendenti' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
