-- Sonda del battito: la lentezza conta come guasto.
--
-- 08/10/2026: prima del blocco delle 11:47 la sonda interna registrava «ok» risposte da 12 e 56 secondi: il database
-- stava soffocando e nessun avviso partiva. Ora sopra i 15 secondi il controllo è fallito (errore «risposta lenta»):
-- tre di fila (sei minuti) mandano l'email «Edilizia in Cloud non risponde» come per un guasto vero.
-- Il blocco completo lo vede la sentinella esterna (.github/workflows/sentinella-database.yml): questa gira dentro il
-- database e quando lui si ferma si ferma anche lei.

CREATE OR REPLACE FUNCTION public.battito_verifica()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
DECLARE v_chiusi int; v_scaduti int; v_avviso jsonb;
BEGIN
  WITH agg AS (
    UPDATE public.battito_esterno b
       -- 08/10/2026: una risposta oltre 15 secondi non è «ok». Quel giorno la sonda registrava ok con 12, 56
       -- secondi mentre il database stava per bloccarsi: ora tre risposte lente di fila fanno partire l'avviso.
       SET esito       = CASE WHEN r.status_code = 200 AND r.created - b.avviato_il <= interval '15 seconds' THEN 'ok' ELSE 'fallito' END,
           status_code = r.status_code,
           errore      = COALESCE(r.error_msg, CASE WHEN r.status_code = 200 THEN 'risposta lenta (oltre 15 secondi)' END),
           durata_ms   = GREATEST(EXTRACT(MILLISECONDS FROM (r.created - b.avviato_il))::int, 0)
      FROM net._http_response r
     WHERE r.id = b.request_id AND b.esito IS NULL
    RETURNING 1
  ) SELECT count(*) INTO v_chiusi FROM agg;

  WITH agg AS (
    UPDATE public.battito_esterno
       SET esito = 'fallito', errore = COALESCE(errore, 'nessuna risposta entro 90 secondi')
     WHERE esito IS NULL AND avviato_il < now() - interval '90 seconds'
    RETURNING 1
  ) SELECT count(*) INTO v_scaduti FROM agg;

  DELETE FROM public.battito_esterno WHERE avviato_il < now() - interval '30 days';

  -- Se l'avviso fallisce, il battito non deve fermarsi: la registrazione vale
  -- anche senza email, l'email senza registrazione no.
  BEGIN
    v_avviso := public.battito_avvisa();
  EXCEPTION WHEN OTHERS THEN
    v_avviso := jsonb_build_object('errore', SQLERRM);
    RAISE WARNING 'Battito: avviso non riuscito: %', SQLERRM;
  END;

  RETURN jsonb_build_object('chiusi', v_chiusi, 'senza_risposta', v_scaduti, 'avviso', v_avviso);
END; $function$
;
