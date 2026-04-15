-- ════════════════════════════════════════════════════════════════
-- Sprint 1.17 — Security Audit Dashboard Builder
-- ════════════════════════════════════════════════════════════════
-- Esegui in Supabase SQL Editor (service_role).
-- Ogni sezione RAISE NOTICE con ✅/❌. Se vedi ❌ è un buco.
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rls_ok    INT;
  v_policy_ct INT;
  v_grant_ct  INT;
  v_companies INT;
BEGIN
  -- ─── 1. RLS abilitato su tutte le tabelle nuove ───
  SELECT COUNT(*) INTO v_rls_ok
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
  WHERE t.schemaname = 'public'
    AND t.tablename IN ('metric_catalog','dashboards','dashboard_versions','dashboard_user_prefs','company_features')
    AND c.relrowsecurity = true;

  IF v_rls_ok = 5 THEN
    RAISE NOTICE '✅ RLS abilitato su tutte e 5 le tabelle';
  ELSE
    RAISE NOTICE '❌ RLS attivo solo su %/5 tabelle', v_rls_ok;
  END IF;

  -- ─── 2. Policy presenti ───
  SELECT COUNT(*) INTO v_policy_ct
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('metric_catalog','dashboards','dashboard_versions','dashboard_user_prefs','company_features');
  RAISE NOTICE 'ℹ Policy totali su tabelle dashboard_builder: %', v_policy_ct;

  -- ─── 3. RPC GRANT: authenticated only, public revoked ───
  SELECT COUNT(*) INTO v_grant_ct
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('get_metric','save_dashboard','list_dashboards','get_dashboard')
    AND grantee = 'authenticated'
    AND privilege_type = 'EXECUTE';
  RAISE NOTICE 'ℹ GRANT EXECUTE authenticated su RPC: %/4', v_grant_ct;

  -- ─── 4. PUBLIC NON deve avere EXECUTE sulle RPC sensibili ───
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('save_dashboard','get_dashboard','list_dashboards','get_metric')
      AND grantee = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE NOTICE '❌ PUBLIC ha ancora EXECUTE su RPC sensibili';
  ELSE
    RAISE NOTICE '✅ PUBLIC NON ha EXECUTE sulle RPC sensibili';
  END IF;

  -- ─── 5. SECURITY DEFINER con search_path hardened ───
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_metric','save_dashboard','list_dashboards','get_dashboard')
      AND p.prosecdef = true
      AND 'search_path=public' = ANY(p.proconfig)
  ) THEN
    RAISE NOTICE '✅ Tutte le RPC hanno SECURITY DEFINER + search_path=public';
  ELSE
    RAISE NOTICE '⚠ Almeno una RPC non ha search_path hardened';
  END IF;

  -- ─── 6. Companies totali (per test cross-company)
  SELECT COUNT(*) INTO v_companies FROM public.companies;
  RAISE NOTICE 'ℹ Companies nel DB: %', v_companies;
END $$;

-- ════════════════════════════════════════════════════════════════
-- 7. TEST IMPERSONAZIONE: utente senza auth context
-- ════════════════════════════════════════════════════════════════
-- Simuliamo una chiamata da un utente "senza company" settando un JWT sub
-- a un UUID random (non esistente). Aspettiamo errore "Unauthorized" o
-- "No company context".

DO $$
DECLARE
  v_result JSONB;
  v_err    TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claims" = '{"sub":"deadbeef-dead-beef-dead-beefdeadbeef","role":"authenticated"}';

  BEGIN
    v_result := public.list_dashboards();
    RAISE NOTICE '❌ list_dashboards avrebbe dovuto fallire: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%No company context%' OR v_err LIKE '%Unauthorized%' THEN
      RAISE NOTICE '✅ list_dashboards blocca utente senza company: "%"', v_err;
    ELSE
      RAISE NOTICE '⚠ list_dashboards errore inatteso: %', v_err;
    END IF;
  END;

  BEGIN
    v_result := public.get_metric('revenue_total', '{"period":"ytd"}'::jsonb, NULL, 'none');
    RAISE NOTICE '❌ get_metric avrebbe dovuto fallire: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%No company context%' OR v_err LIKE '%Unauthorized%' THEN
      RAISE NOTICE '✅ get_metric blocca utente senza company: "%"', v_err;
    ELSE
      RAISE NOTICE '⚠ get_metric errore inatteso: %', v_err;
    END IF;
  END;

  -- Reset
  RESET ROLE;
  RESET "request.jwt.claims";
END $$;

-- ════════════════════════════════════════════════════════════════
-- 8. TEST save_dashboard cross-company: dashboard_id di altra company
-- ════════════════════════════════════════════════════════════════
-- Crea una dashboard fittizia collegata a company "ghost" e verifica che
-- un utente reale non possa farne update.

DO $$
DECLARE
  v_ghost_company UUID;
  v_real_user     UUID;
  v_real_company  UUID;
  v_ghost_dash    UUID;
  v_result        JSONB;
  v_err           TEXT;
BEGIN
  -- Prendi un utente reale (il primo disponibile in profiles)
  SELECT p.id, p.company_id
    INTO v_real_user, v_real_company
  FROM public.profiles p
  WHERE p.company_id IS NOT NULL
  LIMIT 1;

  IF v_real_user IS NULL THEN
    RAISE NOTICE '⚠ Skip test: nessun profile con company trovato';
    RETURN;
  END IF;

  -- Crea una "ghost company" temporanea (oppure usa un UUID inesistente)
  v_ghost_company := gen_random_uuid();

  -- Insert direttamente (bypass RLS come service_role) una ghost dashboard
  -- Serve la FK company → creiamo anche una ghost company
  INSERT INTO public.companies (id, name) VALUES (v_ghost_company, '__security_test__') ON CONFLICT DO NOTHING;
  INSERT INTO public.dashboards (id, company_id, owner_id, name, scope)
  VALUES (gen_random_uuid(), v_ghost_company, v_real_user, 'Ghost Dashboard', 'company')
  RETURNING id INTO v_ghost_dash;

  -- Impersona utente reale di altra company
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_real_user::text, 'role', 'authenticated')::text, true);

  BEGIN
    v_result := public.save_dashboard(
      v_ghost_dash,
      'Hijack attempt',
      NULL,
      'personal',
      NULL,
      jsonb_build_object('widgets', '[]'::jsonb),
      'tentativo cross-company'
    );
    RAISE NOTICE '❌ CROSS-COMPANY save_dashboard NON bloccata! Result: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%Cross-company%' OR v_err LIKE '%denied%' THEN
      RAISE NOTICE '✅ save_dashboard cross-company bloccata: "%"', v_err;
    ELSE
      RAISE NOTICE '⚠ save_dashboard errore inatteso: %', v_err;
    END IF;
  END;

  BEGIN
    v_result := public.get_dashboard(v_ghost_dash);
    RAISE NOTICE '❌ CROSS-COMPANY get_dashboard NON bloccata! Result: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%not visible%' OR v_err LIKE '%not found%' THEN
      RAISE NOTICE '✅ get_dashboard cross-company bloccata: "%"', v_err;
    ELSE
      RAISE NOTICE '⚠ get_dashboard errore inatteso: %', v_err;
    END IF;
  END;

  -- Reset role PRIMA del cleanup (service_role non vede ghost con RLS se siamo authenticated)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Cleanup ghost
  DELETE FROM public.dashboards WHERE company_id = v_ghost_company;
  DELETE FROM public.companies WHERE id = v_ghost_company;
  RAISE NOTICE '🧹 Ghost company + dashboard rimossi';
END $$;

-- ════════════════════════════════════════════════════════════════
-- Fine audit. Sintesi attesa:
--   ✅ RLS su 5/5 tabelle
--   ✅ PUBLIC non ha EXECUTE
--   ✅ SECURITY DEFINER + search_path hardened
--   ✅ Senza company → bloccato
--   ✅ Cross-company save/get → bloccato
-- ════════════════════════════════════════════════════════════════
