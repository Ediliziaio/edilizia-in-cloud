-- Funzioni SECURITY DEFINER interne: le esegue solo il servizio.
--
-- Trovato il 26/09/2026 nell'audit dei permessi: 65 funzioni SECURITY DEFINER
-- che scrivono, senza nessun controllo su chi le chiama, erano eseguibili da
-- ogni utente autenticato (anon no: chiuso il 07/09). Tra queste:
--   - crediti: pool_ricarica, pool_consuma, pool_rispecchia (imposta il
--     saldo), add_email_credits_with_log, add_whatsapp_credits_with_log,
--     refund_email_credit_on_bounce: chiunque ricaricava, svuotava o
--     impostava i crediti di qualsiasi azienda;
--   - enforce_company_lifecycle: con tolleranza 0 sospendeva le aziende con
--     una fattura insoluta;
--   - il cervello di Silvio: brain_upsert_kb_chunk e brain_soft_delete_kb_chunks
--     scrivevano e cancellavano la base di conoscenza di tutti;
--   - referral: statistiche e click dei segnalatori;
--   - notifiche con link a qualsiasi utente (campo_notifica), liste fredde
--     rigenerate (crm_refresh_cold_lists toglie i membri), punteggi dei
--     contatti azzerati a forza di chiamate (decay_marketing_lead_scores),
--     automazioni dei moduli rilanciate (trigger_form_automations);
--   - take_pre_migration_snapshot copiava le righe di qualsiasi tabella.
--
-- Nessuna pagina le chiama. Le chiamano (verificato il 26/09/2026):
--   - le funzioni del server con la chiave di servizio (stripe-webhook,
--     auto-topup-*, email-*, kb-*, silvio-*, form-submit, track-referral-click…);
--   - i cron, che girano come postgres;
--   - altre funzioni e trigger SECURITY DEFINER, che girano col proprietario.
-- Quindi l'esecuzione resta al servizio (service_role) e al proprietario.
-- Restano aperte, perché le chiamano le pagine, quelle che servono con un
-- controllo dentro (a parte) e le pubbliche di proposito (firma OdV e SAL,
-- talent, portale: funzioni_pubbliche_di_proposito).

set local lock_timeout = '3s';

do $revoca$
declare
  elenco constant text[] := array[
    'add_email_credits_with_log', 'add_whatsapp_credits_with_log', 'aggrega_metriche_email_giorno',
    'ai_ab_test_increment', 'assign_round_robin', 'avvisa_crediti_email_esauriti', 'battito_avvia',
    'battito_verifica', 'brain_soft_delete_kb_chunks', 'brain_upsert_kb_chunk', 'bump_email_regola_match',
    'bump_persona_memory_hit', 'campo_notifica', 'cleanup_cestino_article_families', 'cleanup_notifiche_cooldown',
    'cleanup_old_accountant_signup_attempts', 'cleanup_old_referral_signup_attempts', 'cleanup_rate_limits',
    'collega_anagrafica_cliente', 'complete_workflow_run', 'crea_notifiche_rate_in_arrivo',
    'create_task_due_notifications', 'crm_refresh_cold_lists', 'cron_job_failure_check',
    'decay_marketing_lead_scores', 'decrement_scorta', 'email_oauth_mark_sync', 'email_thread_increment',
    'enforce_company_lifecycle', 'fea_expire_stale_requests', 'increment_branch_stats', 'increment_budget_spend',
    'increment_referral_link_clicks', 'increment_referrer_clicks', 'kb_external_source_apply_change',
    'kb_external_source_mark_error', 'kb_external_source_mark_unchanged', 'kb_track_retrieval',
    'log_accountant_signup_attempt', 'log_referral_signup_attempt', 'mark_entity_embedded', 'mark_entity_for_embed',
    'ops_canarino_raccogli', 'outreach_register_open', 'outreach_runs_pulisci', 'pool_consuma', 'pool_ricarica',
    'pool_rispecchia', 'recompute_opportunity_value', 'refund_email_credit_on_bounce',
    'reset_daily_budget_if_needed', 'ricalcola_ricezione_oda', 'seed_default_auto_topup',
    'silvio_admin_alert_upsert', 'silvio_cleanup_old_uploads', 'silvio_decision_log_expire_old',
    'silvio_kb_track_citation', 'silvio_promote_due_reminders', 'silvio_tool_qualify_public_lead',
    'silvio_workflow_advance', 'silvio_workflow_start', 'take_pre_migration_snapshot',
    'trigger_form_automations', 'update_interaction_sentiment', 'update_referrer_stats'
  ];
  f record;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any (elenco)
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
    n := n + 1;
  end loop;
  -- Un nome scritto male non deve passare in silenzio.
  if n <> cardinality(elenco) then
    raise exception 'funzioni trovate % su % in elenco', n, cardinality(elenco);
  end if;
end
$revoca$;
