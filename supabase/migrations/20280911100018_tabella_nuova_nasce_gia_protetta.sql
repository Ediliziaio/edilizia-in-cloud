-- Coda della …017, e chiude il buco che quella lasciava aperto: una tabella
-- nuova con `company_id` NON nasceva con la policy `blocco_utente_bloccato`,
-- quindi bastava aggiungere una tabella perche' il blocco utente tornasse a
-- non valere li' dentro — in silenzio, e con mesi di ritardo prima che
-- qualcuno se ne accorgesse. E' lo stesso meccanismo con cui erano nate le
-- sedici FK al default della …009.
--
-- Il posto giusto esisteva gia': l'event trigger `check_rls_on_create_table`,
-- che su `ddl_command_end` chiama `check_new_table_rls()`. Ma quella funzione
-- si limitava a SEGNALARE: scriveva una riga `rls_missing` in
-- `system_health_metrics` e finiva li'. Un avviso in una tabella che nessuno
-- legge non e' una protezione — e' il modo in cui questi problemi nascono.
-- Ora la funzione fa la cosa: crea la policy insieme alla tabella.
--
-- Tre precauzioni, tutte volute:
--  · la CREATE POLICY sta in un blocco EXCEPTION. Se per qualsiasi motivo non
--    riesce, la creazione della tabella NON deve fallire: si registra
--    l'avviso e si va avanti. Un event trigger che rompe le migrazioni altrui
--    e' peggio del problema che risolve.
--  · si controlla che `utente_bloccato()` esista davvero. Al ripristino di un
--    dump le tabelle nascono prima delle funzioni, e senza questo controllo
--    ogni CREATE TABLE fallirebbe.
--  · nessuna ricorsione: la CREATE POLICY genera a sua volta un
--    `ddl_command_end`, ma con object_type 'policy', che il ciclo non guarda.
--
-- Corretto anche un difetto dell'originale: il filtro sullo schema stava
-- DENTRO il `NOT EXISTS`, quindi una tabella creata in un qualunque altro
-- schema veniva segnalata come «creata senza RLS». Ora lo schema si controlla
-- prima, e le tabelle fuori da `public` vengono semplicemente ignorate.
--
-- Provato con rollback: tabella nuova con `company_id` -> nasce con la policy;
-- senza `company_id` -> non prende niente; senza RLS -> l'avviso storico parte
-- come prima.

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
        EXECUTE format('CREATE POLICY blocco_utente_bloccato ON %s '
                    || 'AS RESTRICTIVE FOR ALL TO authenticated '
                    || 'USING (NOT public.utente_bloccato()) '
                    || 'WITH CHECK (NOT public.utente_bloccato())', obj.object_identity);
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
