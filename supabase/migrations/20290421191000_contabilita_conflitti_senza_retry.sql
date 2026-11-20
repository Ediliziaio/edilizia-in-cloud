-- Il conflitto di versione è definitivo: PostgREST deve restituire 409 al
-- client, senza ritentare come farebbe per un errore di serializzazione.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid,pg_get_functiondef(p.oid) definizione FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('contabilita_verifica_provvisoria','contabilita_modifica_scrittura','contabilita_elimina_scrittura','contabilita_salva_conti_fattura') LOOP
    IF strpos(f.definizione,quote_literal('40001'))>0 THEN
      EXECUTE replace(f.definizione,quote_literal('40001'),quote_literal('PT409'));
    END IF;
  END LOOP;
END $migration$;
