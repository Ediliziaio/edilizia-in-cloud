-- SEC-018: Fix storage bucket policies — aggiunta company_id scoping
--
-- Vulnerabilità identificata: le policy di DELETE/SELECT/INSERT sui bucket
-- marketing-attachments, campaign-attachments e prima-nota-attachments
-- non restricevano l'accesso per company_id — qualsiasi utente autenticato
-- poteva leggere, inserire o eliminare file di qualsiasi altra azienda.
--
-- Fix: ricrea tutte le policy di questi bucket con il pattern standard:
--   (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
-- che limita l'accesso solo alla cartella della propria azienda.
-- (File structure attesa: {company_id}/{filename})

-- ============================================================
-- marketing-attachments
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload marketing attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view marketing attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete marketing attachments" ON storage.objects;

DROP POLICY IF EXISTS "ma_ins" ON storage.objects;
CREATE POLICY "ma_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

DROP POLICY IF EXISTS "ma_sel" ON storage.objects;
CREATE POLICY "ma_sel" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'marketing-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

DROP POLICY IF EXISTS "ma_del" ON storage.objects;
CREATE POLICY "ma_del" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketing-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

-- ============================================================
-- campaign-attachments
-- ============================================================
DROP POLICY IF EXISTS "Auth users can upload campaign attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can read campaign attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete campaign attachments" ON storage.objects;

DROP POLICY IF EXISTS "ca_ins" ON storage.objects;
CREATE POLICY "ca_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

DROP POLICY IF EXISTS "ca_sel" ON storage.objects;
CREATE POLICY "ca_sel" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'campaign-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

DROP POLICY IF EXISTS "ca_del" ON storage.objects;
CREATE POLICY "ca_del" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'campaign-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

-- ============================================================
-- prima-nota-attachments
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload prima nota attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read prima nota attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete prima nota attachments" ON storage.objects;

DROP POLICY IF EXISTS "pna_ins" ON storage.objects;
CREATE POLICY "pna_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prima-nota-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

DROP POLICY IF EXISTS "pna_sel" ON storage.objects;
CREATE POLICY "pna_sel" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prima-nota-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );

DROP POLICY IF EXISTS "pna_del" ON storage.objects;
CREATE POLICY "pna_del" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'prima-nota-attachments'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')
  );
