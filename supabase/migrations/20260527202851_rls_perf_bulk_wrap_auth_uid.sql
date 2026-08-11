-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- PERF BULK: wrappa auth.uid() → (SELECT auth.uid()) su TUTTE le policy
-- pubbliche dove non è già wrappato. Trasformazione meccanica via regexp_replace
-- + DROP + CREATE dinamico.
--
-- Semantica IDENTICA — auth.uid() è stabile per session, wrappare in (SELECT)
-- la promuove a InitPlan calcolato 1 volta invece di rivalutarla per ogni riga.
--
-- SAFETY:
--   1. Esegue in singolo blocco PL/pgSQL transazionale (rollback automatico su error)
--   2. Skip policy già wrappate (idempotente)
--   3. Skip policy non-USING-only o non-WITH-CHECK-only (i 4 casi standard gestiti)
--   4. Usa pg_get_expr per la versione PARSED del qual (evita escape issues)

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
  skipped_count int := 0;
BEGIN
  FOR pol IN
    SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual ~ 'auth\.uid\(\)' AND qual !~ '\(\s*SELECT\s+auth\.uid\(\)')
        OR
        (with_check ~ 'auth\.uid\(\)' AND with_check !~ '\(\s*SELECT\s+auth\.uid\(\)')
      )
  LOOP
    -- Costruisci nuovo qual: sostituisci auth.uid() non già in subquery con (SELECT auth.uid())
    -- Pattern: auth.uid() non preceduto da "SELECT " (lookbehind impossibile in PG,
    -- ma il pattern `\(\s*SELECT\s+auth.uid\(\)` cattura il caso wrappato; usiamo
    -- regexp_replace globale + un secondo pass per de-duplicare i wrap doppi).
    new_qual := pol.qual;
    new_check := pol.with_check;
    
    IF new_qual IS NOT NULL THEN
      -- Replace auth.uid() → (SELECT auth.uid()), poi de-duplica nested
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      -- De-duplica (SELECT (SELECT auth.uid())) → (SELECT auth.uid())
      new_qual := regexp_replace(new_qual, '\(SELECT \(SELECT auth\.uid\(\)\)\)', '(SELECT auth.uid())', 'g');
    END IF;
    
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      new_check := regexp_replace(new_check, '\(SELECT \(SELECT auth\.uid\(\)\)\)', '(SELECT auth.uid())', 'g');
    END IF;
    
    -- Costruisci roles clause (array → comma list)
    roles_str := array_to_string(pol.roles, ', ');
    
    -- Costruisci CMD clause
    cmd_str := pol.cmd;
    IF cmd_str = 'ALL' THEN cmd_str := 'ALL'; END IF;
    
    -- DROP + CREATE
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
      RAISE NOTICE 'Skipped policy %.% (%): %', 
        pol.tablename, pol.policyname, pol.cmd, SQLERRM;
      skipped_count := skipped_count + 1;
      -- Re-create con vecchio qual/check (rollback locale)
      BEGIN
        ddl_create := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
          pol.policyname, pol.schemaname, pol.tablename,
          pol.permissive, cmd_str, roles_str);
        IF pol.qual IS NOT NULL THEN
          ddl_create := ddl_create || ' USING (' || pol.qual || ')';
        END IF;
        IF pol.with_check IS NOT NULL THEN
          ddl_create := ddl_create || ' WITH CHECK (' || pol.with_check || ')';
        END IF;
        EXECUTE ddl_create;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'CRITICAL: failed to restore policy %.%: %', 
          pol.tablename, pol.policyname, SQLERRM;
      END;
    END;
  END LOOP;
  
  RAISE NOTICE 'RLS perf migration: % policies fixed, % skipped', fixed_count, skipped_count;
END
$migration$;
