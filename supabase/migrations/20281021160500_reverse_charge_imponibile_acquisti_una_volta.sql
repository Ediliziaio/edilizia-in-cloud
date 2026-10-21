-- Reverse charge nel registro (vedi 20281021160000): tra gli acquisti
-- l'imponibile della fattura ricevuta c'è già (con IVA zero); l'integrazione
-- aggiunge solo l'imposta, altrimenti l'imponibile acquisti contava due volte.
-- Fra le vendite invece entra con imponibile e imposta. Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  d text := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  a text := $a$    SELECT aliquota, imponibile, imposta FROM rc
  ),$a$;
  b text := $b$    SELECT aliquota, 0::numeric, imposta FROM rc
  ),$b$;
BEGIN
  IF position(b in d) > 0 THEN RAISE NOTICE 'Già aggiornata'; RETURN; END IF;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'Testo non trovato: acq_tutte'; END IF;
  EXECUTE replace(d, a, b);
END $$;
