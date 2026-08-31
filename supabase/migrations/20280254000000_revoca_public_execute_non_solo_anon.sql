-- Correzione della 20280253: revocare EXECUTE ad `anon` NON bastava.
-- In Postgres CREATE FUNCTION concede EXECUTE a PUBLIC, e anon eredita da li'.
-- Dopo la 20280253 l'ACL delle funzioni era ancora:
--     =X/postgres | postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- dove il ruolo vuoto davanti a "=X" e' PUBLIC. Verificato in prod: le chiamate
-- anonime a increment_order_total, do_recalculate_quote_totals,
-- recompute_order_progress e crm_refresh_cold_lists continuavano a passare.
--
-- Qui si revoca a PUBLIC e si ri-concede esplicitamente ai ruoli che servono,
-- cosi' per authenticated/service_role non cambia nulla e cade solo l'anonimo.
-- Verificato dopo l'applicazione: anon riceve 42501 "permission denied for
-- function", l'utente autenticato arriva regolarmente alla guardia applicativa.
DO $do$
DECLARE
  v_nomi text[] := ARRAY[
    'aggrega_metriche_email_giorno','ai_ab_test_increment','assign_round_robin',
    'bank_account_recompute_manual_balance','bump_persona_memory_hit',
    'change_order_status','consume_email_otp','crm_flag_undeliverable_emails',
    'crm_recompute_cold_icp','crm_refresh_cold_lists','decrement_scorta',
    'do_recalculate_quote_totals','email_thread_increment','fv_sync_one_family',
    'increment_agent_stats','increment_branch_stats',
    'increment_budget_spend','increment_referral_link_clicks',
    'increment_referrer_clicks','kb_external_source_apply_change','kb_track_retrieval',
    'literacy_set_completion','log_accountant_signup_attempt','log_referral_signup_attempt',
    'mark_entity_for_embed','outreach_register_open','recompute_opportunity_value',
    'recompute_order_progress','record_referral_conversion',
    'refresh_order_salespeople_commissions','refund_email_credit_on_bounce',
    'reset_daily_budget_if_needed','ricalcola_ricezione_oda','silvio_admin_alert_upsert',
    'silvio_tool_qualify_public_lead','silvio_workflow_advance','take_pre_migration_snapshot',
    'trigger_form_automations','update_interaction_sentiment','update_kb_sync_status',
    'update_referrer_stats'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY(v_nomi)
       AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- Queste due muovono soldi (importo commessa, payout referral) e le chiamano
  -- solo edge function in service_role: nessun utente finale, nemmeno loggato.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('increment_order_total','generate_monthly_payouts')
       AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$do$;
