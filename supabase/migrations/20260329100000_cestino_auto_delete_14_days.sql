-- ═══════════════════════════════════════════════════════════════════
-- Cestino: auto-eliminazione dopo 14 giorni
-- I documenti con deleted_at impostato da più di 14 giorni vengono
-- eliminati definitivamente dal database.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Funzione che elimina i documenti scaduti dal cestino
CREATE OR REPLACE FUNCTION public.cleanup_cestino_documenti()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Elimina documenti con deleted_at > 14 giorni fa
  -- Solo documenti in stato "annullata" o "bozza" (safety check)
  DELETE FROM documenti_fiscali
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '14 days'
    AND stato IN ('annullata', 'bozza')
  RETURNING 1;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE LOG 'cestino cleanup: eliminati % documenti scaduti', deleted_count;
  END IF;
END;
$$;

-- 2. Abilita pg_cron se non già attivo
-- (pg_cron è disponibile su Supabase pro+, altrimenti va usato un cron esterno)
DO $$
BEGIN
  -- Prova a creare il job cron; se pg_cron non è disponibile, logga un warning
  BEGIN
    PERFORM cron.schedule(
      'cleanup-cestino-14gg',        -- nome job
      '0 3 * * *',                    -- ogni giorno alle 03:00 UTC
      'SELECT public.cleanup_cestino_documenti()'
    );
    RAISE LOG 'pg_cron job "cleanup-cestino-14gg" schedulato con successo';
  EXCEPTION
    WHEN undefined_function THEN
      RAISE WARNING 'pg_cron non disponibile — configurare un cron esterno per chiamare cleanup_cestino_documenti()';
    WHEN insufficient_privilege THEN
      RAISE WARNING 'pg_cron: permessi insufficienti — configurare un cron esterno';
    WHEN OTHERS THEN
      RAISE WARNING 'pg_cron setup fallito: % — configurare un cron esterno', SQLERRM;
  END;
END;
$$;

-- 3. Grant per la funzione (chiamabile anche da Edge Functions come fallback)
GRANT EXECUTE ON FUNCTION public.cleanup_cestino_documenti() TO service_role;
