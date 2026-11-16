-- Bolletta scartata col costo già registrato (piano punti aperti 16/11/2026, §3): l'avviso diceva
-- «annullalo (e le sue scadenze) dalla fattura», ma dalla fattura non c'era un modo. Ora c'è
-- «Annulla costo» (20290417100000), in Costi → Utenze accanto alla bolletta e nella scheda del costo.
DO $bolletta$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.bolletta_decidi(uuid,text)'::regprocedure);
  n := replace(d, $a$'Scartata: la fattura è rifiutata. Il costo era già registrato: annullalo (e le sue scadenze) dalla fattura.'$a$,
                  $a$'Scartata: la fattura è rifiutata. Il costo era già registrato: annullalo con «Annulla costo» (Costi → Utenze o scheda del costo), le sue scadenze si annullano con lui.'$a$);
  IF n <> d THEN EXECUTE n; END IF;
END $bolletta$;
