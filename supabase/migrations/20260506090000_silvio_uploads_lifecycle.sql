-- FIX 4 (C8) Sprint AI Hardening 1
-- Auto-cleanup dei file caricati in silvio-uploads dopo 30 giorni.
-- Motivazione: gli allegati chat (audio trascritti, PDF, screenshot) possono
-- contenere PII (nomi cliente, salari, dati sanitari). GDPR richiede una
-- retention policy esplicita.
--
-- Strategia: cron job pg_cron che elimina i file più vecchi di 30 giorni
-- dal bucket. Il record nei messaggi chat (`internal_chat_messages.attachment_url`)
-- resta ma il file fisico viene rimosso (signed URL diventa 404).
-- Un trigger elimina anche l'attachment_url dal messaggio per pulizia.

-- Step 1: Funzione che elimina i file vecchi dallo storage
CREATE OR REPLACE FUNCTION public.silvio_cleanup_old_uploads()
RETURNS TABLE(deleted_count INT, errors_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted INT := 0;
  v_errors INT := 0;
  v_obj RECORD;
BEGIN
  -- Cancella file più vecchi di 30 giorni dal bucket silvio-uploads
  FOR v_obj IN
    SELECT name, bucket_id
    FROM storage.objects
    WHERE bucket_id = 'silvio-uploads'
      AND created_at < (NOW() - INTERVAL '30 days')
    LIMIT 1000  -- safety: max 1000 cancellazioni per run
  LOOP
    BEGIN
      DELETE FROM storage.objects
      WHERE bucket_id = v_obj.bucket_id AND name = v_obj.name;
      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- Pulisci anche attachment_url stale nei messaggi (se file non esiste più)
  UPDATE public.internal_chat_messages
  SET attachment_url = NULL,
      attachment_name = COALESCE(attachment_name, '') || ' [eliminato per retention]'
  WHERE attachment_url IS NOT NULL
    AND attachment_url LIKE '%silvio-uploads%'
    AND created_at < (NOW() - INTERVAL '30 days');

  RETURN QUERY SELECT v_deleted, v_errors;
END;
$$;

COMMENT ON FUNCTION public.silvio_cleanup_old_uploads() IS
  'GDPR retention: elimina file silvio-uploads >30gg + pulisce attachment_url stale. Run via pg_cron.';

-- Step 2: Schedula cron job daily 03:00 (server time UTC)
-- Nota: pg_cron deve essere abilitato nel progetto Supabase (pro plan)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Rimuovi schedule precedente se esiste (idempotente)
    PERFORM cron.unschedule('silvio-uploads-cleanup-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-uploads-cleanup-daily');

    PERFORM cron.schedule(
      'silvio-uploads-cleanup-daily',
      '0 3 * * *',  -- daily 03:00 UTC
      $cron$ SELECT public.silvio_cleanup_old_uploads(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron non disponibile — la cleanup deve essere triggherata manualmente o via edge function schedulata';
  END IF;
END $$;

-- Step 3: Aggiungi flag per tracciare retention (opzionale)
COMMENT ON TABLE public.internal_chat_messages IS
  'Messaggi chat interna. attachment_url su bucket silvio-uploads ha retention 30gg via silvio_cleanup_old_uploads().';
