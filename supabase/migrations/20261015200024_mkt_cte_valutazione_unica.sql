-- Stessi calcoli/dati/permessi: impedisce la riespansione dei CTE riutilizzati.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $migration$
DECLARE definition text; cte text;
BEGIN
  definition:=pg_get_functiondef('public.mkt_calcola_metriche(date)'::regprocedure);
  FOREACH cte IN ARRAY ARRAY['base','calc','calc2','calc3','calc4'] LOOP
    IF strpos(definition,cte||' AS MATERIALIZED (')>0 THEN CONTINUE; END IF;
    IF strpos(definition,cte||' AS (')=0 THEN
      RAISE EXCEPTION 'CTE % diverso dalla versione verificata',cte;
    END IF;
    definition:=replace(definition,cte||' AS (',cte||' AS MATERIALIZED (');
  END LOOP;
  -- CREATE OR REPLACE preserva owner/ACL e le caratteristiche preesistenti.
  EXECUTE definition;
END;
$migration$;
