SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Una proposta di associazione non è un costo del mezzo finché non è confermata.
DO $$
DECLARE
 v text:=pg_get_functiondef('public.mezzi_spese_12_mesi(uuid,uuid)'::regprocedure);
 prima text:='where l.company_id = p_company and fr.data_fattura';
 dopo text:='where l.company_id = p_company and l.confermata and fr.data_fattura';
BEGIN
 IF position(dopo IN v)>0 THEN RETURN; END IF;
 IF (length(v)-length(replace(v,prima,'')))/length(prima)<>1 THEN
  RAISE EXCEPTION 'mezzi_spese_12_mesi: filtro inatteso, revisione necessaria';
 END IF;
 EXECUTE replace(v,prima,dopo);
END $$;
