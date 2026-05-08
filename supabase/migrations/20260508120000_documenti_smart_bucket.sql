-- Crea bucket documenti-smart per upload foto/audio dal flusso AI preventivo
-- (QuoteFromCaptureDialog + ai-quote-from-capture edge function)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documenti-smart',
  'documenti-smart',
  false,
  52428800,  -- 50 MB max per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4',
    'audio/aac', 'audio/x-m4a'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Autenticati possono caricare file nel proprio percorso captures/<company_id>/...
DO $$ BEGIN
  CREATE POLICY "documenti_smart_upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'documenti-smart'
      AND auth.uid() IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Autenticati possono leggere i propri file
DO $$ BEGIN
  CREATE POLICY "documenti_smart_read"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'documenti-smart'
      AND auth.uid() IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Autenticati possono cancellare i propri file (cleanup post-elaborazione)
DO $$ BEGIN
  CREATE POLICY "documenti_smart_delete"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'documenti-smart'
      AND auth.uid() IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN storage.buckets.id IS
  'documenti-smart: bucket temporaneo per foto/audio AI preventivo. File eliminati dopo elaborazione.';
