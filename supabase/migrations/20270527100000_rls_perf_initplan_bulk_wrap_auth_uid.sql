-- ============================================================================
-- RLS PERF — InitPlan optimization bulk wrap di auth.uid() su tutte le policy
-- ============================================================================
-- 2026-05-27 — Applicata su DB via 4 migration MCP atomiche:
--   1. rls_perf_user_roles_initplan         (3 policy)
--   2. rls_perf_multi_company_access_initplan (5 policy)
--   3. rls_perf_top4_tables_initplan         (11 policy: email_inbox + ...)
--   4. rls_perf_bulk_wrap_auth_uid          (resto via PL/pgSQL automatico)
--
-- IMPATTO MISURATO:
--   - Da 1102 policy con auth.uid() unwrapped → 0
--   - Da 388 with_check unwrapped → 0
--   - Policy wrapped totale: 1153 / 1818 totali public
--   - Tabella user_roles: 671k reads/settimana × 3 policy → +60% throughput stimato
--   - Tabella multi_company_access: 59k reads × 5 policy
--   - email_inbox 17MB: scan ottimizzati per row count
--
-- SEMANTICA: invariata. auth.uid() restituisce sempre lo stesso valore in una
-- session (è la session JWT user_id). Wrappare in (SELECT auth.uid()) lo
-- promuove a InitPlan calcolato 1 volta invece di rivalutato per ogni riga.
-- Pattern raccomandato da Supabase docs:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- TRASFORMAZIONE MECCANICA (regexp_replace):
--   auth.uid()                       → (SELECT auth.uid())
--   (SELECT (SELECT auth.uid()))     → (SELECT auth.uid())   [de-dup nested]
-- ============================================================================

-- Script idempotente: rilancia il bulk sostitutivo solo sulle policy ancora
-- non wrappate (no-op se già applicato).
DO $migration$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  cmd_str text;
  roles_str text;
  ddl_drop text;
  ddl_create text;
  fixed_count int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual ~ 'auth\.uid\(\)' AND qual !~ '\(\s*SELECT\s+auth\.uid\(\)')
        OR (with_check ~ 'auth\.uid\(\)' AND with_check !~ '\(\s*SELECT\s+auth\.uid\(\)')
      )
  LOOP
    new_qual := pol.qual;
    new_check := pol.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      new_qual := regexp_replace(new_qual, '\(SELECT \(SELECT auth\.uid\(\)\)\)', '(SELECT auth.uid())', 'g');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      new_check := regexp_replace(new_check, '\(SELECT \(SELECT auth\.uid\(\)\)\)', '(SELECT auth.uid())', 'g');
    END IF;

    roles_str := array_to_string(pol.roles, ', ');
    cmd_str := pol.cmd;

    ddl_drop := format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
    ddl_create := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      pol.policyname, pol.schemaname, pol.tablename,
      pol.permissive, cmd_str, roles_str);
    IF new_qual IS NOT NULL THEN
      ddl_create := ddl_create || ' USING (' || new_qual || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      ddl_create := ddl_create || ' WITH CHECK (' || new_check || ')';
    END IF;

    BEGIN
      EXECUTE ddl_drop;
      EXECUTE ddl_create;
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %.% (%): %', pol.tablename, pol.policyname, pol.cmd, SQLERRM;
      -- Re-create con vecchio qual/check come safety net
      BEGIN
        ddl_create := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
          pol.policyname, pol.schemaname, pol.tablename,
          pol.permissive, cmd_str, roles_str);
        IF pol.qual IS NOT NULL THEN ddl_create := ddl_create || ' USING (' || pol.qual || ')'; END IF;
        IF pol.with_check IS NOT NULL THEN ddl_create := ddl_create || ' WITH CHECK (' || pol.with_check || ')'; END IF;
        EXECUTE ddl_create;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'CRITICAL: failed to restore %.%: %', pol.tablename, pol.policyname, SQLERRM;
      END;
    END;
  END LOOP;

  RAISE NOTICE 'RLS perf migration completed: % policies wrapped', fixed_count;
END
$migration$;
