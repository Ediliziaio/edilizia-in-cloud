SET LOCAL lock_timeout = '3s';

DROP INDEX IF EXISTS public.idx_email_inbox_embedding;
DROP INDEX IF EXISTS public.idx_email_inbox_user_folder_account_received;
DROP INDEX IF EXISTS public.idx_email_inbox_user_ai_category_received;
DROP INDEX IF EXISTS public.idx_email_inbox_company_categoria;

DROP INDEX IF EXISTS public.idx_mktc_geo;
DROP INDEX IF EXISTS public.idx_contacts_norm_piva;
DROP INDEX IF EXISTS public.idx_mc_company_region;
DROP INDEX IF EXISTS public.idx_marketing_contacts_google_campaign;
DROP INDEX IF EXISTS public.ix_marketing_contacts_company_tipo_stato;
DROP INDEX IF EXISTS public.idx_marketing_contacts_meta_campaign;
DROP INDEX IF EXISTS public.idx_marketing_contacts_source_campaign;
DROP INDEX IF EXISTS public.idx_mc_company_dipendenti;
DROP INDEX IF EXISTS public.idx_marketing_contacts_gclid;
DROP INDEX IF EXISTS public.idx_marketing_contacts_unsubscribed;
DROP INDEX IF EXISTS public.idx_marketing_opportunities_meta_campaign;
DROP INDEX IF EXISTS public.idx_mosh_company;

DROP INDEX IF EXISTS public.idx_web_vitals_path_created;
DROP INDEX IF EXISTS public.user_action_log_recente_idx;
DROP INDEX IF EXISTS public.openwa_messages_body_trgm;
DROP INDEX IF EXISTS public.idx_outreach_queue_to_email_lower;
DROP INDEX IF EXISTS public.idx_opct_email;
DROP INDEX IF EXISTS public.idx_opct_stato;
DROP INDEX IF EXISTS public.idx_opc_segm;
DROP INDEX IF EXISTS public.idx_outreach_enrollments_due;
DROP INDEX IF EXISTS public.idx_company_activity_log_action;
DROP INDEX IF EXISTS public.idx_activity_log_importance_high;
DROP INDEX IF EXISTS public.idx_activity_log_actor_user;
DROP INDEX IF EXISTS public.idx_listino_history_griglia;
DROP INDEX IF EXISTS public.idx_listino_history_family;
DROP INDEX IF EXISTS public.idx_lg_prodotto_xy;
DROP INDEX IF EXISTS public.idx_profiles_ricerca_trgm;
DROP INDEX IF EXISTS public.idx_silvio_alerts_open;
DROP INDEX IF EXISTS public.idx_silvio_alerts_category_status;
DROP INDEX IF EXISTS public.ix_orders_client_name_trgm;
DROP INDEX IF EXISTS public.idx_attribution_sessions_visitor;
DROP INDEX IF EXISTS public.idx_attribution_sessions_started;
DROP INDEX IF EXISTS public.idx_attribution_pageviews_sessione;
DROP INDEX IF EXISTS public.attribution_pageviews_path_idx;
DROP INDEX IF EXISTS public.idx_article_families_cf_gin;
DROP INDEX IF EXISTS public.idx_tariffe_aziendali_cf_gin;
DROP INDEX IF EXISTS public.idx_central_audit_actor;
DROP INDEX IF EXISTS public.idx_tool_execution_log_persona;

CREATE INDEX IF NOT EXISTS system_health_metrics_recorded_at_idx ON public.system_health_metrics (recorded_at);
CREATE INDEX IF NOT EXISTS web_vitals_events_created_at_idx ON public.web_vitals_events (created_at);
CREATE INDEX IF NOT EXISTS cron_sentinelle_esiti_misurato_at_idx ON public.cron_sentinelle_esiti (misurato_at);

CREATE OR REPLACE FUNCTION public.pulisci_telemetria(p_lotto integer DEFAULT 20000)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_metriche integer;
  v_vitals integer;
  v_sentinelle integer;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '60s';

  DELETE FROM system_health_metrics
   WHERE id IN (
     SELECT id FROM system_health_metrics
      WHERE recorded_at < now() - interval '90 days'
         OR (recorded_at < now() - interval '30 days'
             AND error_message IS NULL AND coalesce(status_code, 0) < 400)
      LIMIT p_lotto);
  GET DIAGNOSTICS v_metriche = ROW_COUNT;

  DELETE FROM web_vitals_events
   WHERE id IN (SELECT id FROM web_vitals_events
                 WHERE created_at < now() - interval '30 days' LIMIT p_lotto);
  GET DIAGNOSTICS v_vitals = ROW_COUNT;

  DELETE FROM cron_sentinelle_esiti
   WHERE id IN (SELECT id FROM cron_sentinelle_esiti
                 WHERE misurato_at < now() - interval '30 days' LIMIT p_lotto);
  GET DIAGNOSTICS v_sentinelle = ROW_COUNT;

  RETURN jsonb_build_object('metriche', v_metriche, 'web_vitals', v_vitals, 'sentinelle', v_sentinelle);
END;
$$;

REVOKE ALL ON FUNCTION public.pulisci_telemetria(integer) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulizia-telemetria';
  PERFORM cron.schedule('pulizia-telemetria', '55 3 * * *', 'SELECT public.pulisci_telemetria()');
END $$;
