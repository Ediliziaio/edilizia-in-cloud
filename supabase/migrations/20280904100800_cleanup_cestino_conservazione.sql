-- F0-04 (correzione della correzione) — Il cestino rispetta la conservazione
-- fiscale obbligatoria.
--
-- Tolta la clausola RETURNING che faceva fallire la funzione, il job ha
-- ricominciato a girare e ha subito colpito un ostacolo più serio:
--   ERROR: Un documento fattura in stato "annullata" non si cancella:
--          la conservazione è obbligatoria.
-- Il trigger documenti_fiscali_proteggi_emessi impedisce — correttamente — di
-- cancellare fatture, note e DDT che non siano bozze.
--
-- La funzione stava quindi tentando qualcosa che non deve fare. Ora seleziona
-- solo ciò che è legalmente cancellabile: dei 35 documenti nel cestino da oltre
-- 14 giorni (33 fatture e 2 DDT annullati) non ne viene rimosso nessuno, ed è
-- il comportamento corretto.

CREATE OR REPLACE FUNCTION public.cleanup_cestino_documenti()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  deleted_count integer;
  protetti_count integer;
BEGIN
  SELECT count(*) INTO protetti_count
  FROM documenti_fiscali
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '14 days'
    AND public.documento_fiscale_e_immutabile(tipo, stato);

  DELETE FROM documenti_fiscali
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '14 days'
    AND stato IN ('annullata', 'bozza')
    AND NOT public.documento_fiscale_e_immutabile(tipo, stato);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 OR protetti_count > 0 THEN
    RAISE LOG 'cestino cleanup: eliminati % documenti, % trattenuti per conservazione obbligatoria',
      deleted_count, protetti_count;
  END IF;
END;
$function$;
