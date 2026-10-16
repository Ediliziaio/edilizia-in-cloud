-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- Ottimizza solo policy già definite, senza creare o allargare accessi.
DO $rls_initplan_dependencies$
BEGIN
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accountant_notifications' AND policyname='accountant_notifications_service_role_all') THEN
 ALTER POLICY accountant_notifications_service_role_all ON public.accountant_notifications USING (((select current_setting('role'::text, true)) = 'service_role'::text)) WITH CHECK (((select current_setting('role'::text, true)) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accountant_signup_attempts' AND policyname='service_role_all_access') THEN
 ALTER POLICY service_role_all_access ON public.accountant_signup_attempts USING (((select current_setting('role'::text, true)) = 'service_role'::text)) WITH CHECK (((select current_setting('role'::text, true)) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_invites' AND policyname='service_role_admin_invites') THEN
 ALTER POLICY service_role_admin_invites ON public.admin_invites USING (((select auth.role()) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_act_compliance_status' AND policyname='compliance_read_all') THEN
 ALTER POLICY compliance_read_all ON public.ai_act_compliance_status USING (((select auth.role()) = ANY (ARRAY['authenticated'::text, 'service_role'::text])));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_system_classification' AND policyname='aiclass_read_all') THEN
 ALTER POLICY aiclass_read_all ON public.ai_system_classification USING (((select auth.role()) = ANY (ARRAY['authenticated'::text, 'service_role'::text])));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bonifica_azioni' AND policyname='bonifica_azioni_super_admin') THEN
 ALTER POLICY bonifica_azioni_super_admin ON public.bonifica_azioni USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='digest_log' AND policyname='digest_log_self') THEN
 ALTER POLICY digest_log_self ON public.digest_log USING (((utente_id = (select auth.uid())) AND (company_id = get_effective_company_id())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='domini_invio' AND policyname='domini_invio_super_admin') THEN
 ALTER POLICY domini_invio_super_admin ON public.domini_invio USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_accessi' AND policyname='email_accessi_super_admin') THEN
 ALTER POLICY email_accessi_super_admin ON public.email_accessi USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_collegamenti' AND policyname='email_collegamenti_super_admin') THEN
 ALTER POLICY email_collegamenti_super_admin ON public.email_collegamenti USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_correzioni' AND policyname='email_correzioni_super_admin') THEN
 ALTER POLICY email_correzioni_super_admin ON public.email_correzioni USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_ddt_carico' AND policyname='email_ddt_carico_super_admin') THEN
 ALTER POLICY email_ddt_carico_super_admin ON public.email_ddt_carico USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_delivery_log' AND policyname='service_role_email_log') THEN
 ALTER POLICY service_role_email_log ON public.email_delivery_log USING (((select auth.role()) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_documento_estratto' AND policyname='email_doc_estratto_super_admin') THEN
 ALTER POLICY email_doc_estratto_super_admin ON public.email_documento_estratto USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_evento_bozza' AND policyname='email_evento_bozza_super_admin') THEN
 ALTER POLICY email_evento_bozza_super_admin ON public.email_evento_bozza USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_inbox' AND policyname='email_inbox_select') THEN
 ALTER POLICY email_inbox_select ON public.email_inbox USING (((user_id = (select auth.uid())) OR ((user_id IS NULL) AND (company_id = get_my_company_id()) AND is_email_staff_interno())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_metriche_giorno' AND policyname='email_metriche_super_admin') THEN
 ALTER POLICY email_metriche_super_admin ON public.email_metriche_giorno USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_opportunita_bozza' AND policyname='email_opp_bozza_super_admin') THEN
 ALTER POLICY email_opp_bozza_super_admin ON public.email_opportunita_bozza USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_regole' AND policyname='email_regole_super_admin') THEN
 ALTER POLICY email_regole_super_admin ON public.email_regole USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_scadenza_bozza' AND policyname='email_scad_bozza_super_admin') THEN
 ALTER POLICY email_scad_bozza_super_admin ON public.email_scadenza_bozza USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fornitori_iban_storico' AND policyname='fornitori_iban_storico_super_admin') THEN
 ALTER POLICY fornitori_iban_storico_super_admin ON public.fornitori_iban_storico USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kb_aggregated_benchmarks' AND policyname='benchmarks_read_all') THEN
 ALTER POLICY benchmarks_read_all ON public.kb_aggregated_benchmarks USING (((select auth.role()) = ANY (ARRAY['authenticated'::text, 'service_role'::text])));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_api_usage' AND policyname='super_admin read api_usage') THEN
 ALTER POLICY "super_admin read api_usage" ON public.lead_scraper_api_usage USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_autopilot' AND policyname='super_admin manage autopilot') THEN
 ALTER POLICY "super_admin manage autopilot" ON public.lead_scraper_autopilot USING (has_role((select auth.uid()), 'super_admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_jobs' AND policyname='super_admin manage lss_jobs') THEN
 ALTER POLICY "super_admin manage lss_jobs" ON public.lead_scraper_jobs USING (has_role((select auth.uid()), 'super_admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_outreach' AND policyname='super_admin read outreach') THEN
 ALTER POLICY "super_admin read outreach" ON public.lead_scraper_outreach USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_place_cache' AND policyname='super_admin read place_cache') THEN
 ALTER POLICY "super_admin read place_cache" ON public.lead_scraper_place_cache USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_results' AND policyname='super_admin manage lss_results') THEN
 ALTER POLICY "super_admin manage lss_results" ON public.lead_scraper_results USING (has_role((select auth.uid()), 'super_admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_scraper_searches' AND policyname='super_admin manage lss_searches') THEN
 ALTER POLICY "super_admin manage lss_searches" ON public.lead_scraper_searches USING (has_role((select auth.uid()), 'super_admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mittenti_noti' AND policyname='mittenti_noti_super_admin') THEN
 ALTER POLICY mittenti_noti_super_admin ON public.mittenti_noti USING (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifiche_preferenze' AND policyname='notifiche_pref_self') THEN
 ALTER POLICY notifiche_pref_self ON public.notifiche_preferenze USING (((utente_id = (select auth.uid())) AND (company_id = get_effective_company_id()))) WITH CHECK (((utente_id = (select auth.uid())) AND (company_id = get_effective_company_id())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_ai_usage_log' AND policyname='platform_ai_usage_log_service_insert') THEN
 ALTER POLICY platform_ai_usage_log_service_insert ON public.platform_ai_usage_log WITH CHECK (((select auth.role()) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quote_items' AND policyname='qi_anon_sel') THEN
 ALTER POLICY qi_anon_sel ON public.quote_items USING ((EXISTS ( SELECT 1 FROM quotes q WHERE ((q.id = quote_items.quote_id) AND (q.signature_token IS NOT NULL) AND (q.status = ANY (ARRAY['inviata'::text, 'accettata'::text, 'rifiutata'::text, 'scaduta'::text])) AND (q.signature_token = ((select current_setting('request.header.x-quote-token'::text, true)))::uuid)))));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quotes' AND policyname='q_anon_sel') THEN
 ALTER POLICY q_anon_sel ON public.quotes USING (((signature_token IS NOT NULL) AND (status = ANY (ARRAY['inviata'::text, 'accettata'::text, 'rifiutata'::text, 'scaduta'::text])) AND (signature_token = ((select current_setting('request.header.x-quote-token'::text, true)))::uuid)));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_signup_attempts' AND policyname='service_role_all_access') THEN
 ALTER POLICY service_role_all_access ON public.referral_signup_attempts USING (((select current_setting('role'::text, true)) = 'service_role'::text)) WITH CHECK (((select current_setting('role'::text, true)) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='render_persiane_sessions' AND policyname='rps_service_role_all') THEN
 ALTER POLICY rps_service_role_all ON public.render_persiane_sessions USING (((select auth.role()) = 'service_role'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sa_company_intel' AND policyname='sa_company_intel_super') THEN
 ALTER POLICY sa_company_intel_super ON public.sa_company_intel USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sa_company_problems' AND policyname='sa_problems_super') THEN
 ALTER POLICY sa_problems_super ON public.sa_company_problems USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sa_conversation_signals' AND policyname='sa_conv_signals_super') THEN
 ALTER POLICY sa_conv_signals_super ON public.sa_conversation_signals USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sa_problem_to_package' AND policyname='sa_pkg_super') THEN
 ALTER POLICY sa_pkg_super ON public.sa_problem_to_package USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scraped_companies' AND policyname='super_admin manage scraped_companies') THEN
 ALTER POLICY "super_admin manage scraped_companies" ON public.scraped_companies USING (has_role((select auth.uid()), 'super_admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'super_admin'::app_role));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sdi_cedente_config' AND policyname='company reads own sdi config') THEN
 ALTER POLICY "company reads own sdi config" ON public.sdi_cedente_config USING (((company_id = get_user_company_id((select auth.uid()))) OR has_role((select auth.uid()), 'super_admin'::app_role)));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sequenze' AND policyname='sequenze_super') THEN
 ALTER POLICY sequenze_super ON public.sequenze USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sequenze_esecuzioni' AND policyname='seq_esec_super') THEN
 ALTER POLICY seq_esec_super ON public.sequenze_esecuzioni USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sequenze_invii' AND policyname='seq_invii_super') THEN
 ALTER POLICY seq_invii_super ON public.sequenze_invii USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='signature_requests' AND policyname='public_read_by_token') THEN
 ALTER POLICY public_read_by_token ON public.signature_requests USING (((token IS NOT NULL) AND (token = (select current_setting('request.header.x-signature-token'::text, true)))));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='signature_requests' AND policyname='public_update_by_token') THEN
 ALTER POLICY public_update_by_token ON public.signature_requests USING (((status = 'pending'::text) AND (token IS NOT NULL) AND (token = (select current_setting('request.header.x-signature-token'::text, true))))) WITH CHECK ((status = 'signed'::text));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_ads_campaigns' AND policyname='silvio_ads_campaigns_read') THEN
 ALTER POLICY silvio_ads_campaigns_read ON public.silvio_ads_campaigns USING ((company_id = ( SELECT p.company_id FROM profiles p WHERE (p.id = (select auth.uid())))));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_audit' AND policyname='silvio_audit_super') THEN
 ALTER POLICY silvio_audit_super ON public.silvio_audit USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_azioni' AND policyname='silvio_azioni_super') THEN
 ALTER POLICY silvio_azioni_super ON public.silvio_azioni USING (is_super_admin((select auth.uid()))) WITH CHECK (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_azioni_override' AND policyname='silvio_ovr_super') THEN
 ALTER POLICY silvio_ovr_super ON public.silvio_azioni_override USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_budget' AND policyname='silvio_budget_super') THEN
 ALTER POLICY silvio_budget_super ON public.silvio_budget USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_canali_identita' AND policyname='silvio_canali_proprietario_del') THEN
 ALTER POLICY silvio_canali_proprietario_del ON public.silvio_canali_identita USING (((utente_id = (select auth.uid())) AND (company_id = get_effective_company_id())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_canali_identita' AND policyname='silvio_canali_proprietario_sel') THEN
 ALTER POLICY silvio_canali_proprietario_sel ON public.silvio_canali_identita USING (((utente_id = (select auth.uid())) AND (company_id = get_effective_company_id())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_canali_identita' AND policyname='silvio_canali_super') THEN
 ALTER POLICY silvio_canali_super ON public.silvio_canali_identita USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_coda_conferme' AND policyname='silvio_coda_super') THEN
 ALTER POLICY silvio_coda_super ON public.silvio_coda_conferme USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_decision_rules' AND policyname='silvio_decision_rules_super') THEN
 ALTER POLICY silvio_decision_rules_super ON public.silvio_decision_rules USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_esecuzioni' AND policyname='silvio_esec_super') THEN
 ALTER POLICY silvio_esec_super ON public.silvio_esecuzioni USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_generation_jobs' AND policyname='silvio_gen_jobs_super') THEN
 ALTER POLICY silvio_gen_jobs_super ON public.silvio_generation_jobs USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_outbound_messages' AND policyname='silvio_outbound_super') THEN
 ALTER POLICY silvio_outbound_super ON public.silvio_outbound_messages USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_playbook' AND policyname='silvio_playbook_super') THEN
 ALTER POLICY silvio_playbook_super ON public.silvio_playbook USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_playbook_definitions' AND policyname='playbook_def_read') THEN
 ALTER POLICY playbook_def_read ON public.silvio_playbook_definitions USING (((select auth.role()) = ANY (ARRAY['authenticated'::text, 'service_role'::text])));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_task' AND policyname='silvio_task_super') THEN
 ALTER POLICY silvio_task_super ON public.silvio_task USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_task_passi' AND policyname='silvio_task_passi_super') THEN
 ALTER POLICY silvio_task_passi_super ON public.silvio_task_passi USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_tool_steps' AND policyname='silvio_tool_steps_read') THEN
 ALTER POLICY silvio_tool_steps_read ON public.silvio_tool_steps USING ((EXISTS ( SELECT 1 FROM internal_chat_channels c WHERE ((c.id = silvio_tool_steps.channel_id) AND (c.dm_user_ids @> ARRAY[(select auth.uid())])))));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='silvio_trigger_log' AND policyname='silvio_trigger_super') THEN
 ALTER POLICY silvio_trigger_super ON public.silvio_trigger_log USING (is_super_admin((select auth.uid())));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sr_progetti' AND policyname='sr_progetti_public_token_read') THEN
 ALTER POLICY sr_progetti_public_token_read ON public.sr_progetti USING (((public_token IS NOT NULL) AND (stato = ANY (ARRAY['da_consegnare'::sr_stato_progetto, 'consegnato'::sr_stato_progetto, 'in_valutazione'::sr_stato_progetto, 'accettato'::sr_stato_progetto])) AND ((((select current_setting('request.jwt.claims'::text, true)))::jsonb ->> 'sr_public_token'::text) = public_token)));
END IF;
IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_invoices' AND policyname='service_role_manage_invoices') THEN
 ALTER POLICY service_role_manage_invoices ON public.subscription_invoices USING (((select auth.role()) = 'service_role'::text));
END IF;

END $rls_initplan_dependencies$;
