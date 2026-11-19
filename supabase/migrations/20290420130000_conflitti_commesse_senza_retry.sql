-- Allinea le installazioni che hanno già ricevuto le funzioni delle commesse.
-- Le guardie applicative restituiscono HTTP 409 senza retry del gateway.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $migration$
DECLARE
  funzione regprocedure;
  definizione text;
BEGIN
  FOREACH funzione IN ARRAY ARRAY[
    'private.registro_subappalto(uuid,uuid,jsonb)'::regprocedure,
    'private.previsionale_cantiere(uuid,uuid,jsonb)'::regprocedure,
    'private.pipeline_commesse(uuid,jsonb)'::regprocedure
  ] LOOP
    definizione := pg_get_functiondef(funzione);
    IF strpos(definizione, '''40001''') > 0 THEN
      EXECUTE replace(definizione, '''40001''', '''PT409''');
    END IF;
  END LOOP;
END;
$migration$;
