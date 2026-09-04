-- Svuotamento del cestino documenti: falliva ogni notte dal 22/08/2026.
--
-- La pulizia cancellava tutto cio' che era in stato 'annullata' o 'bozza', ma
-- per fatture, note di credito e DDT anche lo stato "annullata" e' immutabile
-- (conservazione obbligatoria): il trigger di protezione sollevava
-- un'eccezione e faceva fallire l'INTERA transazione. Risultato: il cestino
-- non si svuotava piu' per NESSUN documento, nemmeno per le bozze.
--
-- Ora si usa la stessa fonte di verita' del trigger
-- (documento_fiscale_e_immutabile): si cancella cio' che e' cancellabile e si
-- lascia in cestino cio' che la legge vuole conservato.
CREATE OR REPLACE FUNCTION public.cleanup_cestino_documenti()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_cancellati integer;
  v_protetti integer;
BEGIN
  DELETE FROM documenti_fiscali d
  WHERE d.deleted_at IS NOT NULL
    AND d.deleted_at < NOW() - INTERVAL '14 days'
    AND d.stato IN ('annullata', 'bozza')
    AND NOT public.documento_fiscale_e_immutabile(d.tipo, d.stato);
  GET DIAGNOSTICS v_cancellati = ROW_COUNT;

  SELECT count(*) INTO v_protetti
  FROM documenti_fiscali d
  WHERE d.deleted_at IS NOT NULL
    AND d.deleted_at < NOW() - INTERVAL '14 days'
    AND public.documento_fiscale_e_immutabile(d.tipo, d.stato);

  IF v_cancellati > 0 OR v_protetti > 0 THEN
    RAISE LOG 'cestino cleanup: % eliminati, % conservati per obbligo fiscale', v_cancellati, v_protetti;
  END IF;
END;
$function$;
