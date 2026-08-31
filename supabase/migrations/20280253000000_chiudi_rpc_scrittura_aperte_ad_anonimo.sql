-- Terzo strato dell'audit: oltre alle RPC di piattaforma (20280250) e a quelle
-- cross-tenant (20280251), resta un gruppo di funzioni SECURITY DEFINER che
-- SCRIVONO e sono chiamabili da un anonimo senza alcun controllo.
--
-- Provato in prod da anonimo, con la sola chiave pubblica:
--   change_order_status  -> rispondeva 23503 "Key (order_id)=... is not present
--                           in table orders", cioe' era ARRIVATA alla scrittura
--                           e si era fermata solo perche' l'ordine era finto.
--                           Con un order_id vero cambiava lo stato di qualsiasi
--                           commessa, scriveva lo storico e il diario, con
--                           p_changed_by a scelta dell'attaccante.
--   increment_order_total     -> eseguita, nessun errore (0 righe toccate)
--   do_recalculate_quote_totals, recompute_order_progress,
--   crm_refresh_cold_lists    -> idem
--
-- Fra le peggiori del gruppo: bank_account_recompute_manual_balance (saldi
-- bancari), decrement_scorta (giacenze), increment_budget_spend (budget),
-- literacy_set_completion (segna corsi come superati per QUALSIASI user_id, con
-- URL del certificato a scelta), generate_monthly_payouts e
-- refund_email_credit_on_bounce (soldi).
--
-- Verificato nel repo chi le chiama davvero: NESSUNA e' usata da una pagina
-- pubblica, tranne submit_public_reputation_review (PublicReview.tsx), che
-- infatti resta aperta. Tutte le altre passano da edge function che usano
-- SERVICE_ROLE (quindi non sono toccate da una revoca su anon) oppure da
-- pagine autenticate. Le chiamate interne (trigger, cron, altre funzioni)
-- girano in contesto definer/postgres e non passano dal ruolo anon.
--
-- Quindi: revoca dell'EXECUTE ad anon su tutto il gruppo, piu' una guardia vera
-- dentro change_order_status, che dal frontend serve ancora agli utenti loggati.

-- ── 1. change_order_status: guardia sull'azienda dell'ordine ─────────────
CREATE OR REPLACE FUNCTION public.change_order_status(p_order_id uuid, p_new_status_id uuid, p_changed_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id  UUID;
  v_old_name    TEXT;
  v_new_name    TEXT;
  v_old_id      UUID;
  v_actor_name  TEXT;
BEGIN
  SELECT o.company_id, os.name, o.current_status_id
    INTO v_company_id, v_old_name, v_old_id
    FROM public.orders o
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
   WHERE o.id = p_order_id;

  -- [audit sicurezza 2026-08-31] prima qui non c'era nulla: un anonimo poteva
  -- cambiare lo stato di qualunque commessa di qualunque azienda.
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'ordine inesistente' USING ERRCODE = '42704';
  END IF;
  IF NOT public.user_can_access_company(v_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_new_name
    FROM public.order_statuses
   WHERE id = p_new_status_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor_name
    FROM public.profiles
   WHERE id = p_changed_by;

  UPDATE public.orders
     SET current_status_id = p_new_status_id,
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status_id, changed_by)
  VALUES (p_order_id, p_new_status_id, p_changed_by)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.order_events(order_id, company_id, event_type, payload, actor_id, actor_name)
  VALUES (
    p_order_id,
    v_company_id,
    'stato_cambiato',
    jsonb_build_object(
      'from_status',    v_old_name,
      'to_status',      v_new_name,
      'from_status_id', v_old_id,
      'to_status_id',   p_new_status_id
    ),
    p_changed_by,
    v_actor_name
  );
END;
$function$;

-- ── 2. revoca EXECUTE ad anon sul gruppo ─────────────────────────────────
-- Il DO loop copre automaticamente gli overload (stesso nome, firme diverse).
DO $do$
DECLARE
  v_nomi text[] := ARRAY[
    'aggrega_metriche_email_giorno','ai_ab_test_increment','assign_round_robin',
    'bank_account_recompute_manual_balance','bump_persona_memory_hit',
    'change_order_status','consume_email_otp','crm_flag_undeliverable_emails',
    'crm_recompute_cold_icp','crm_refresh_cold_lists','decrement_scorta',
    'do_recalculate_quote_totals','email_thread_increment','fv_sync_one_family',
    'generate_monthly_payouts','increment_agent_stats','increment_branch_stats',
    'increment_budget_spend','increment_order_total','increment_referral_link_clicks',
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END
$do$;

-- ── 3. due funzioni che solo le edge (service_role) devono poter chiamare ─
-- increment_order_total muove l'importo di una commessa, generate_monthly_payouts
-- genera i payout referral: nessun utente finale deve poterle invocare.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('increment_order_total','generate_monthly_payouts')
       AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END
$do$;
