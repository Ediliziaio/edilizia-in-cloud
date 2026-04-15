-- ════════════════════════════════════════════════════════════════
-- Sprint 1.17 — Security Audit v2 (ritorna tabella visibile)
-- ════════════════════════════════════════════════════════════════
-- Esegui nel SQL Editor. La query finale mostra tutti i check.
-- ════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _audit_results (
  id SERIAL PRIMARY KEY,
  check_name TEXT,
  status TEXT,
  detail TEXT
);

-- ─── 1. RLS su 5 tabelle ───
INSERT INTO _audit_results (check_name, status, detail)
SELECT
  'RLS su 5 tabelle dashboard_builder',
  CASE WHEN COUNT(*) = 5 THEN '✅ OK' ELSE '❌ FAIL' END,
  COUNT(*) || '/5 tabelle con RLS'
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
  AND t.tablename IN ('metric_catalog','dashboards','dashboard_versions','dashboard_user_prefs','company_features')
  AND c.relrowsecurity = true;

-- ─── 2. Policies totali ───
INSERT INTO _audit_results (check_name, status, detail)
SELECT
  'Policy RLS totali',
  CASE WHEN COUNT(*) >= 8 THEN '✅ OK' ELSE '⚠ LOW' END,
  COUNT(*) || ' policy trovate'
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('metric_catalog','dashboards','dashboard_versions','dashboard_user_prefs','company_features');

-- ─── 3. RPC GRANT authenticated ───
INSERT INTO _audit_results (check_name, status, detail)
SELECT
  'GRANT EXECUTE authenticated su 4 RPC',
  CASE WHEN COUNT(*) = 4 THEN '✅ OK' ELSE '❌ FAIL' END,
  COUNT(*) || '/4 RPC grantate ad authenticated'
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('get_metric','save_dashboard','list_dashboards','get_dashboard')
  AND grantee = 'authenticated'
  AND privilege_type = 'EXECUTE';

-- ─── 4. PUBLIC revoked ───
INSERT INTO _audit_results (check_name, status, detail)
SELECT
  'PUBLIC NON ha EXECUTE su RPC',
  CASE WHEN COUNT(*) = 0 THEN '✅ OK' ELSE '❌ FAIL' END,
  'Grant residui a PUBLIC: ' || COUNT(*)
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('save_dashboard','get_dashboard','list_dashboards','get_metric')
  AND grantee = 'PUBLIC'
  AND privilege_type = 'EXECUTE';

-- ─── 5. SECURITY DEFINER + search_path ───
INSERT INTO _audit_results (check_name, status, detail)
SELECT
  'SECURITY DEFINER + search_path=public su 4 RPC',
  CASE WHEN COUNT(*) = 4 THEN '✅ OK' ELSE '⚠ CHECK' END,
  COUNT(*) || '/4 RPC hardened'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_metric','save_dashboard','list_dashboards','get_dashboard')
  AND p.prosecdef = true
  AND 'search_path=public' = ANY(p.proconfig);

-- ─── 6. Companies nel DB ───
INSERT INTO _audit_results (check_name, status, detail)
SELECT
  'Companies totali nel DB',
  'ℹ INFO',
  COUNT(*)::text || ' companies'
FROM public.companies;

-- ─── 7. Test sicurezza dinamici (impersonazione) ───
DO $$
DECLARE
  v_real_user     UUID;
  v_ghost_company UUID := gen_random_uuid();
  v_ghost_dash    UUID;
  v_err           TEXT;
  v_result        JSONB;
BEGIN
  -- A. Utente senza company
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"deadbeef-dead-beef-dead-beefdeadbeef","role":"authenticated"}', true);
    v_result := public.list_dashboards();
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('list_dashboards() da utente senza company', '❌ FAIL', 'Avrebbe dovuto bloccare: ' || v_result::text);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('list_dashboards() da utente senza company',
      CASE WHEN v_err ILIKE '%company%' OR v_err ILIKE '%unauthorized%' THEN '✅ OK' ELSE '⚠ CHECK' END,
      v_err);
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- B. Utente senza company su get_metric
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      '{"sub":"deadbeef-dead-beef-dead-beefdeadbeef","role":"authenticated"}', true);
    v_result := public.get_metric('revenue_total', '{"period":"ytd"}'::jsonb, NULL, 'none');
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('get_metric() da utente senza company', '❌ FAIL', 'Avrebbe dovuto bloccare');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('get_metric() da utente senza company',
      CASE WHEN v_err ILIKE '%company%' OR v_err ILIKE '%unauthorized%' THEN '✅ OK' ELSE '⚠ CHECK' END,
      v_err);
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- C. Cross-company save_dashboard
  SELECT p.id INTO v_real_user FROM public.profiles p WHERE p.company_id IS NOT NULL LIMIT 1;

  IF v_real_user IS NULL THEN
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('Cross-company save_dashboard', '⚠ SKIP', 'Nessun profile con company');
    RETURN;
  END IF;

  -- Crea ghost company+dashboard
  INSERT INTO public.companies (id, name, email)
  VALUES (v_ghost_company, '__security_test__', '__sec_test_' || v_ghost_company::text || '@test.local');

  INSERT INTO public.dashboards (company_id, owner_id, name, scope)
  VALUES (v_ghost_company, v_real_user, 'Ghost Dashboard', 'company')
  RETURNING id INTO v_ghost_dash;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', v_real_user::text, 'role', 'authenticated')::text, true);
    v_result := public.save_dashboard(
      v_ghost_dash, 'Hijack', NULL, 'personal', NULL,
      jsonb_build_object('widgets', '[]'::jsonb), 'cross');
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('save_dashboard() cross-company', '❌ FAIL', 'Avrebbe dovuto bloccare: ' || v_result::text);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('save_dashboard() cross-company',
      CASE WHEN v_err ILIKE '%cross%' OR v_err ILIKE '%denied%' OR v_err ILIKE '%not visible%' OR v_err ILIKE '%not found%' THEN '✅ OK' ELSE '⚠ CHECK' END,
      v_err);
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', v_real_user::text, 'role', 'authenticated')::text, true);
    v_result := public.get_dashboard(v_ghost_dash);
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('get_dashboard() cross-company', '❌ FAIL', 'Avrebbe dovuto bloccare: ' || v_result::text);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO _audit_results (check_name, status, detail)
    VALUES ('get_dashboard() cross-company',
      CASE WHEN v_err ILIKE '%not visible%' OR v_err ILIKE '%not found%' OR v_err ILIKE '%denied%' THEN '✅ OK' ELSE '⚠ CHECK' END,
      v_err);
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Cleanup
  DELETE FROM public.dashboards WHERE company_id = v_ghost_company;
  DELETE FROM public.companies WHERE id = v_ghost_company;
  INSERT INTO _audit_results (check_name, status, detail)
  VALUES ('Cleanup ghost company', '🧹 DONE', 'Rimossa');
END $$;

-- ─── FINALE: mostra tabella risultati ───
SELECT status, check_name, detail FROM _audit_results ORDER BY id;
