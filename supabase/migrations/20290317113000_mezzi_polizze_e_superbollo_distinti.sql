SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- RCA, CVT/polizze aggiuntive e bollo/superbollo sono obblighi indipendenti.
DO $$
DECLARE
 v text:=pg_get_viewdef('public.mezzi_scadenze'::regclass,true);
 pattern text:=$p$WHEN d\.categoria = ANY \(ARRAY\['assicurazione'::text, 'bollo'::text, 'revisione'::text\]\) THEN d\.categoria$p$;
 nuovo text:=$q$WHEN d.categoria = 'revisione'::text THEN d.categoria
 WHEN d.categoria IN ('assicurazione','bollo') AND nullif(btrim(regexp_replace(coalesce(d.titolo,''),'[[:space:]]+',' ','g')),'') IS NULL THEN d.categoria$q$;
BEGIN
 IF position($m$WHEN d.categoria = 'revisione'::text THEN d.categoria$m$ IN v)>0 THEN RETURN; END IF;
 IF (SELECT count(*) FROM regexp_matches(v,pattern,'g'))<>1 THEN
  RAISE EXCEPTION 'mezzi_scadenze: regola polizze inattesa, revisione necessaria';
 END IF;
 EXECUTE 'CREATE OR REPLACE VIEW public.mezzi_scadenze WITH(security_invoker=true) AS '||regexp_replace(v,pattern,nuovo);
END $$;
