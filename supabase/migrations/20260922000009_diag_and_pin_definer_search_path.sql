-- ============================================================================
-- Diagnostic + hardening sistematico delle SECURITY DEFINER in public
-- ============================================================================
-- Fase 1 (diag): RPC che elenca tutte le functions SECURITY DEFINER prive di
-- un `SET search_path` vincolato. La loro presenza consente a un attaccante
-- che fosse in grado di creare oggetti in uno schema custom di deviare la
-- risoluzione dei nomi ed eseguire codice con privilegi elevati.
--
-- Fase 2 (fix): per ogni function pubblica SECURITY DEFINER senza search_path,
-- ne altera il pinning a `public, pg_catalog`. Questo è sicuro perché:
--   - non cambia comportamento: tutte le query interne già puntano esplicitamente
--     a `public.*`, e pg_catalog è un fallback già presente per i builtin
--   - ALTER FUNCTION ... SET ... è NOEXCLUSIVE lock brevissimo
--   - se una function ha già un search_path, la ALTER la SOSTITUISCE con lo
--     stesso valore (no-op funzionale)
--
-- Nota: non tocchiamo funzioni in extension schemas (es. pgcrypto, pg_net),
-- né il SECURITY INVOKER (non vulnerable al problema).
-- ============================================================================

-- 1) Diagnostic RPC
CREATE OR REPLACE FUNCTION public.diag_list_unpinned_definers()
RETURNS TABLE(
  schema_name  text,
  func_name    text,
  arg_list     text,
  search_path_set boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    n.nspname::text               AS schema_name,
    p.proname::text               AS func_name,
    pg_get_function_identity_arguments(p.oid)::text AS arg_list,
    (p.proconfig IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
         WHERE cfg ILIKE 'search_path=%'
      ))                          AS search_path_set
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
  ORDER BY search_path_set ASC, p.proname;
$$;

REVOKE ALL ON FUNCTION public.diag_list_unpinned_definers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diag_list_unpinned_definers() TO authenticated, service_role;

-- 2) Fix: pinna `search_path = public, pg_catalog` su TUTTE le SECURITY DEFINER
-- di public che non hanno un search_path esplicito. Idempotente — le altre
-- restano invariate (la NON hanno un `proconfig` con `search_path=`).
DO $$
DECLARE
  rec record;
  v_count int := 0;
BEGIN
  FOR rec IN
    SELECT
      n.nspname  AS schema_name,
      p.proname  AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) cfg
           WHERE cfg ILIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_catalog',
      rec.schema_name, rec.func_name, rec.args
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    RAISE NOTICE 'Pinned search_path on % SECURITY DEFINER functions', v_count;
  END IF;
END $$;
