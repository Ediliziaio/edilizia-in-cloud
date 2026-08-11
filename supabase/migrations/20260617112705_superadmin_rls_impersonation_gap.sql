-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'adempimenti_fiscali','adempimenti_sicurezza','cantieri_geofence',
    'client_margin_history','company_activity_summary','company_qr_codes',
    'company_qr_scan_logs','document_analysis_results','documenti_operai',
    'entity_attachments','flow_execution_runs','google_ads_stats','gps_positions',
    'marketing_custom_field_folders','media_library_folders','quote_clause_templates',
    'quote_generation_audit','sal_records','sal_voci','sms_campaigns','sms_contacts',
    'sms_log','sms_provider_config','sms_telnyx_accounts','sms_telnyx_numbers',
    'sms_templates','stock_lotti','stock_units','tipi_documento_operaio',
    'varianti_cliente','verbali_sicurezza','warehouse_lotti','warehouse_scan_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (has_role((SELECT auth.uid()), ''super_admin''::app_role)) WITH CHECK (has_role((SELECT auth.uid()), ''super_admin''::app_role))',
      t || '_superadmin', t);
  END LOOP;
END $$;
