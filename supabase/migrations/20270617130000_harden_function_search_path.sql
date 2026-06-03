-- Sicurezza: pinna search_path sulle funzioni public NOSTRE prive di SET search_path.
-- Chiude il vettore di privilege-escalation (hijack via session search_path), in
-- particolare sui SECURITY DEFINER. Behavior-preserving: public + extensions +
-- pg_temp (in coda, così non può essere ricercato per primo).
-- Esclude le funzioni di proprietà di estensioni (vector/pg_trgm/...). Idempotente.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'search_path pinnato su % funzioni', n;
END $$;
