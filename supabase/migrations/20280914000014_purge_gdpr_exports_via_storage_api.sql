-- La purga notturna degli export GDPR cancellava direttamente da storage.objects,
-- cosa che Supabase ora vieta (trigger protect_delete: la riga sparirebbe ma il
-- file resterebbe orfano). Falliva ogni notte alle 03:15. La cancellazione passa
-- alla Storage API tramite l'edge function purge-gdpr-exports; il database si
-- limita a dire quali file sono scaduti.
CREATE OR REPLACE FUNCTION public.storage_oggetti_scaduti(p_bucket text, p_giorni integer DEFAULT 30)
 RETURNS TABLE(nome text, creato_il timestamptz)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
  SELECT o.name, o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND o.created_at < now() - make_interval(days => GREATEST(p_giorni, 1))
  ORDER BY o.created_at
  LIMIT 500;
$function$;

REVOKE ALL ON FUNCTION public.storage_oggetti_scaduti(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_oggetti_scaduti(text, integer) TO service_role;

DROP FUNCTION IF EXISTS public.purge_gdpr_exports();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-gdpr-exports') THEN
    PERFORM cron.unschedule('purge-gdpr-exports');
  END IF;
  PERFORM cron.schedule(
    'purge-gdpr-exports',
    '15 3 * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/purge-gdpr-exports',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $cmd$
  );
END $$;
