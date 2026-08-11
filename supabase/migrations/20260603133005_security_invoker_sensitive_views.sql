-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Sicurezza: le viste analitiche/finanziarie/cross-tenant erano SECURITY DEFINER
-- (bypassano RLS) e leggibili da anon/authenticated → leak reale. Le converto a
-- security_invoker: l'accesso ora rispetta privilegi+RLS del chiamante. Le RPC
-- admin (SECURITY DEFINER) continuano a leggerle come definer (bypass) → nessuna
-- regressione. Nessuna è usata via client (verificato grep frontend+edge).
-- Lasciate fuori le 3 pubbliche-by-design: ai_personas_public,
-- referral_leaderboard_public, portal_courses_available.
DO $$
DECLARE r record; n int := 0;
  v_names text[] := ARRAY[
    'ai_revenue_summary','lead_scraper_funnel_source','sa_company_problem_score',
    'v_active_render_packs','v_ai_confidence_distribution','v_ai_margin_by_model',
    'v_ai_real_cost_per_model','v_brain_universal_kb_stats','v_cg_costi_classificati',
    'v_cg_ricavi_classificati','v_citation_quality_kpis','v_company_ai_spend',
    'v_council_daily_cost','v_customer_os_cron_status','v_decision_log_kpis',
    'v_decision_log_lessons','v_decision_log_outcome_due','v_decision_log_pending',
    'v_decision_log_playbook_performance','v_document_analyzer_kpis','v_fv_progetti_dashboard',
    'v_fv_stats_azienda','v_kb_external_sources_status','v_kb_imprenditore_edile_stats',
    'v_kb_quality_alerts','v_kb_token_budget','v_markup_simulator','v_silvio_kb_stats',
    'v_subappaltatori_dashboard','web_vitals_p75_7d'
  ];
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY(v_names)
  LOOP
    EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', r.rel);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'security_invoker impostato su % viste', n;
END $$;
