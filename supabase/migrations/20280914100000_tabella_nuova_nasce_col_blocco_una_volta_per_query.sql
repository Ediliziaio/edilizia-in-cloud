-- Le tabelle nuove nascono con la regola «utente bloccato» nella forma veloce.
--
-- La policy RESTRICTIVE `blocco_utente_bloccato` (20280911100017) era scritta
-- `NOT utente_bloccato()`. Quella funzione e' SECURITY DEFINER con un proprio
-- search_path, quindi il pianificatore non la puo' espandere dentro la query:
-- la chiama una volta PER OGNI RIGA letta, comprese le righe delle altre
-- aziende che il resto del filtro scarta subito dopo. Tra parentesi con SELECT
-- diventa un InitPlan, calcolato una volta per query. Stesso significato: se
-- l'utente e' bloccato non vede e non scrive niente.
--
-- Le 765 tabelle esistenti si convertono nelle migrazioni 20280914000013 e
-- 202809141000NN (i lotti). Questa sistema la fonte: l'event trigger
-- `check_rls_on_create_table` (20280911100018), che crea la policy su ogni
-- tabella nuova con `company_id`, la scriveva ancora nella forma lenta.
-- La funzione e' identica a quella della …018: cambiano solo le due espressioni.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.check_new_table_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  obj       record;
  v_rls     boolean;
  v_company boolean;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE object_type = 'table'
  LOOP
    SELECT c.relrowsecurity,
           EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'company_id'
                      AND a.attnum > 0 AND NOT a.attisdropped)
      INTO v_rls, v_company
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.oid = obj.objid AND n.nspname = 'public' AND c.relkind = 'r';

    -- fuori da public, o non e' una tabella vera: non ci riguarda
    CONTINUE WHEN NOT FOUND;

    IF NOT v_rls THEN
      INSERT INTO system_health_metrics (
        metric_type, function_name, error_message, metadata
      ) VALUES (
        'rls_missing',
        'ddl_trigger',
        'Tabella creata senza RLS: ' || obj.object_identity,
        jsonb_build_object('table_name', obj.object_identity, 'event', 'create_table')
      );
    END IF;

    IF v_company
       AND obj.object_identity <> 'public.profiles'
       AND to_regprocedure('public.utente_bloccato()') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_policy pol
                        WHERE pol.polrelid = obj.objid
                          AND pol.polname = 'blocco_utente_bloccato')
    THEN
      BEGIN
        -- (SELECT …): una chiamata per query, non una per riga
        EXECUTE format('CREATE POLICY blocco_utente_bloccato ON %s '
                    || 'AS RESTRICTIVE FOR ALL TO authenticated '
                    || 'USING (NOT (SELECT public.utente_bloccato())) '
                    || 'WITH CHECK (NOT (SELECT public.utente_bloccato()))', obj.object_identity);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO system_health_metrics (
          metric_type, function_name, error_message, metadata
        ) VALUES (
          'blocco_utente_policy_mancante',
          'ddl_trigger',
          'Policy blocco_utente_bloccato non creata su ' || obj.object_identity || ': ' || SQLERRM,
          jsonb_build_object('table_name', obj.object_identity)
        );
      END;
    END IF;
  END LOOP;
END;
$function$;
