SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Il costo annuale somma coperture e tributi distinti, rinnovando solo la stessa serie.
DO $$
DECLARE
 v text:=pg_get_functiondef('public.mezzi_spese_12_mesi(uuid,uuid)'::regprocedure);
 a text:='distinct on (x.mezzo_id, x.categoria)';
 b text:=$q$distinct on (x.mezzo_id, x.categoria, lower(btrim(regexp_replace(coalesce(x.titolo,''),'[[:space:]]+',' ','g'))))$q$;
 c text:='order by x.mezzo_id, x.categoria, x.data_scadenza';
 d text:=$q$order by x.mezzo_id, x.categoria, lower(btrim(regexp_replace(coalesce(x.titolo,''),'[[:space:]]+',' ','g'))), x.data_scadenza$q$;
BEGIN
 IF position(b IN v)>0 THEN RETURN; END IF;
 IF position(a IN v)=0 OR position(c IN v)=0 THEN RAISE EXCEPTION 'mezzi_spese_12_mesi: aggregazione documenti inattesa'; END IF;
 EXECUTE replace(replace(v,a,b),c,d);
END $$;
