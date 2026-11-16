-- La riga «codice trovato ma nessuna partita» (20290417100100) usava alias (k, v) che in
-- tes_classifica sono già variabili: «column reference k is ambiguous», e il motore si fermava
-- sugli incassi senza partite. Applicata un minuto dopo. Il file 20290417100100 ha già gli alias
-- giusti: rilanciata dopo quello, questa non cambia niente.
DO $motore$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  n := replace(d, $a$(SELECT format('Nella causale c''è il codice «%s» della commessa %s, ma quella commessa non ha fatture o rate aperte con questo importo',v->>'codice',v->>'commessa') FROM jsonb_each(cod_ordini) e(k,v) ORDER BY k LIMIT 1)$a$,
                  $a$(SELECT format('Nella causale c''è il codice «%s» della commessa %s, ma quella commessa non ha fatture o rate aperte con questo importo',cx.valore_cod->>'codice',cx.valore_cod->>'commessa') FROM jsonb_each(cod_ordini) cx(chiave_cod,valore_cod) ORDER BY cx.chiave_cod LIMIT 1)$a$);
  IF n <> d THEN EXECUTE n; END IF;
END $motore$;
