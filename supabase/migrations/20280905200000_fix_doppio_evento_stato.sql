-- Correzione: ogni cambio di stato veniva registrato DUE volte.
-- Applicata a produzione via MCP il 2026-09-05.
--
-- Due meccanismi scrivevano lo stesso fatto in company_status_events:
--   • il trigger tg_company_status_event, che scatta su ogni UPDATE di status
--   • enforce_company_lifecycle, che faceva anche un INSERT esplicito per
--     poter allegare il motivo
-- Osservato: la chiusura dei due trial scaduti ha prodotto quattro righe
-- invece di due, una col motivo e una senza.
--
-- Il churn non ne risentiva (conta company_id distinti), ma la storia degli
-- stati è il registro su cui poggiano churn, coorti e KPI: deve dire una cosa
-- sola, una volta sola.
--
-- Ora il trigger è l'unico a scrivere. Chi cambia lo stato deposita il motivo
-- in una variabile di sessione che il trigger raccoglie e poi AZZERA, così il
-- motivo non resta appiccicato a un UPDATE successivo della stessa connessione.

CREATE OR REPLACE FUNCTION public.tg_company_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_actor uuid;
  v_motivo text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
    IF v_actor IS NULL THEN
      BEGIN v_actor := NULLIF(public.audit_request_header('x-actor-id'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
    END IF;

    BEGIN v_motivo := NULLIF(current_setting('app.motivo_stato', true), '');
    EXCEPTION WHEN OTHERS THEN v_motivo := NULL; END;

    BEGIN
      INSERT INTO public.company_status_events
        (company_id, stato_da, stato_a, motivo, attore_id, automatico)
      VALUES (NEW.id, OLD.status, NEW.status, v_motivo, v_actor, v_actor IS NULL);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'company_status_events: %', SQLERRM;
    END;

    BEGIN PERFORM set_config('app.motivo_stato', '', true);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$function$;

-- enforce_company_lifecycle non inserisce più l'evento: imposta il motivo e
-- lascia scrivere il trigger. (Definizione completa applicata via MCP.)

-- Ripulisce le righe doppie già prodotte: si tiene quella col motivo.
DELETE FROM public.company_status_events e
 WHERE e.motivo IS NULL
   AND EXISTS (SELECT 1 FROM public.company_status_events f
                WHERE f.company_id = e.company_id
                  AND f.stato_da IS NOT DISTINCT FROM e.stato_da
                  AND f.stato_a = e.stato_a
                  AND f.motivo IS NOT NULL
                  AND abs(extract(epoch from (f.avvenuto_il - e.avvenuto_il))) < 5);
