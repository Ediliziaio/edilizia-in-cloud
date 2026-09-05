-- F0-04 — Il cestino documenti torna a svuotarsi
--
-- Il job notturno `cleanup-cestino-14gg` falliva a ogni esecuzione con
--   ERROR: query has no destination for result data
-- perché la DELETE aveva una clausola `RETURNING 1` senza destinazione, dentro
-- una funzione che ritorna void. Il conteggio serve solo per il log ed è già
-- ottenuto da GET DIAGNOSTICS subito dopo: la clausola era solo di troppo.
--
-- Effetto: i documenti nel cestino da oltre 14 giorni vengono di nuovo
-- eliminati davvero (retention applicata, non solo promessa).

CREATE OR REPLACE FUNCTION public.cleanup_cestino_documenti()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  -- Elimina documenti con deleted_at > 14 giorni fa
  -- Solo documenti in stato "annullata" o "bozza" (safety check)
  DELETE FROM documenti_fiscali
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '14 days'
    AND stato IN ('annullata', 'bozza');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE LOG 'cestino cleanup: eliminati % documenti scaduti', deleted_count;
  END IF;
END;
$function$;
