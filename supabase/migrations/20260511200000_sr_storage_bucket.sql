-- ═══════════════════════════════════════════════════════════════════════════
-- Storage bucket per modulo Serramenti
-- ---------------------------------------------------------------------------
-- Bucket: sr-progetti (privato)
-- Path: <company_id>/<progetto_id>/preventivo.html
-- Path media: <company_id>/<progetto_id>/photos/<filename>
-- Policy: company_id deve combaciare con la cartella radice.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('sr-progetti', 'sr-progetti', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "sr_progetti_read" ON storage.objects FOR SELECT
    USING (
      bucket_id = 'sr-progetti'
      AND (storage.foldername(name))[1]::uuid = public.get_my_company_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sr_progetti_insert" ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'sr-progetti'
      AND (storage.foldername(name))[1]::uuid = public.get_my_company_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sr_progetti_update" ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'sr-progetti'
      AND (storage.foldername(name))[1]::uuid = public.get_my_company_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sr_progetti_delete" ON storage.objects FOR DELETE
    USING (
      bucket_id = 'sr-progetti'
      AND (storage.foldername(name))[1]::uuid = public.get_my_company_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
