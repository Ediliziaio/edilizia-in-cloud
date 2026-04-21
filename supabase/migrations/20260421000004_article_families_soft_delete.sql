-- ============================================================================
-- article_families · Soft delete con cestino 15 giorni
-- ============================================================================
-- Obiettivo:
--   Sostituire la "disattivazione" (attivo=false) con un vero soft delete
--   (`deleted_at IS NOT NULL`). Le righe nel cestino vengono eliminate
--   definitivamente dopo 15 giorni tramite pg_cron. Preventivi storici che
--   fanno riferimento alla famiglia continuano a funzionare perché snapshot
--   i dati (pattern standard del preventivatore).
--
-- Semantica:
--   - `attivo=true`  + `deleted_at IS NULL`        → visibile in listino
--   - `attivo=false` + `deleted_at IS NULL`        → nascosto (archiviato manualmente)
--   - `deleted_at IS NOT NULL`                     → cestino (verrà purgato)
--
-- Retention: 15 giorni (vs 14 della fattura) — differenziato intenzionalmente
-- per dare all'utente un margine in più su anagrafica prodotto.
-- ============================================================================

-- 1. Colonna deleted_at
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.article_families.deleted_at IS
  'Timestamp soft delete. NULL = riga attiva nel listino o archiviata. '
  'NOT NULL = riga nel cestino, verrà eliminata definitivamente dopo 15 giorni '
  'dal job pg_cron cleanup-cestino-article-families-15gg.';

-- 2. Indice parziale per le query di listino (la stragrande maggioranza filtra
--    deleted_at IS NULL). Evita full scan quando il cestino cresce.
CREATE INDEX IF NOT EXISTS idx_article_families_active
  ON public.article_families (company_id, sort_order)
  WHERE deleted_at IS NULL;

-- 3. Funzione purge: elimina dal DB le righe nel cestino da più di 15 giorni.
--    Cascade automatico su family_axes, axis_values tramite FK ON DELETE CASCADE
--    definite nelle migration originarie (20260917000002).
CREATE OR REPLACE FUNCTION public.cleanup_cestino_article_families()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.article_families
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '15 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE LOG 'cestino article_families: eliminate % famiglie scadute', deleted_count;
  END IF;
END;
$$;

-- 4. Schedula job pg_cron — 30 minuti dopo il job documenti per sparpagliare il carico
DO $$
BEGIN
  BEGIN
    PERFORM cron.schedule(
      'cleanup-cestino-article-families-15gg',
      '30 3 * * *',  -- ogni giorno alle 03:30 UTC
      'SELECT public.cleanup_cestino_article_families()'
    );
    RAISE LOG 'pg_cron job "cleanup-cestino-article-families-15gg" schedulato';
  EXCEPTION
    WHEN undefined_function THEN
      RAISE WARNING 'pg_cron non disponibile — configurare un cron esterno per cleanup_cestino_article_families()';
    WHEN insufficient_privilege THEN
      RAISE WARNING 'pg_cron: permessi insufficienti per schedulare cleanup-cestino-article-families-15gg';
    WHEN OTHERS THEN
      RAISE WARNING 'pg_cron setup fallito per article_families: %', SQLERRM;
  END;
END;
$$;

-- 5. Grant per Edge Functions fallback
GRANT EXECUTE ON FUNCTION public.cleanup_cestino_article_families() TO service_role;

-- 6. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
