SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Una scadenza successiva rinnova solo lo stesso obbligo, non tutta la categoria.
-- Modifica mirata: conserva proiezione, manutenzioni, permessi e RLS della vista.
DO $$
DECLARE
  v text := pg_get_viewdef('public.mezzi_scadenze'::regclass, true);
  pattern text := $p$CASE\s+WHEN d\.categoria = 'altro'::text THEN d\.id(::text)?\s+ELSE d\.categoria\s+END$p$;
  nuovo text := $q$CASE
    WHEN d.categoria IN ('assicurazione','bollo','revisione') THEN d.categoria
    WHEN d.categoria = 'altro' OR nullif(btrim(regexp_replace(coalesce(d.titolo,''), '[[:space:]]+', ' ', 'g')), '') IS NULL
      THEN d.categoria || ':id:' || d.id::text
    ELSE d.categoria || ':titolo:' || lower(btrim(regexp_replace(d.titolo, '[[:space:]]+', ' ', 'g')))
  END$q$;
BEGIN
  IF position(':titolo:' IN v) > 0 THEN RETURN; END IF;
  IF (SELECT count(*) FROM regexp_matches(v, pattern, 'g')) <> 1 THEN
    RAISE EXCEPTION 'mezzi_scadenze: regola rinnovi inattesa, revisione necessaria';
  END IF;
  v := regexp_replace(v, pattern, nuovo);
  EXECUTE 'CREATE OR REPLACE VIEW public.mezzi_scadenze WITH (security_invoker = true) AS ' || v;
END $$;
