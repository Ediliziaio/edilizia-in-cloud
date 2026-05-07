-- Security hardening: AI/privacy tables must not be directly accessible by the
-- unauthenticated PostgREST role. Authenticated users keep their existing grants
-- and are still constrained by RLS; edge functions keep service_role.
--
-- The audit surfaced broad default grants to anon on ai_* tables. This migration
-- revokes those grants across the AI namespace, plus the related Silvio/privacy
-- tables that are not prefixed with ai_.

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      AND (
        c.relname LIKE 'ai\_%' ESCAPE '\'
        OR c.relname LIKE 'silvio\_%' ESCAPE '\'
        OR c.relname IN (
          'internal_chat_messages',
          'company_activity_log',
          'document_analysis_results',
          'client_margin_history',
          'quote_clause_templates',
          'quote_generation_audit',
          'user_notification_preferences',
          'user_daily_briefings',
          'user_channel_bindings',
          'kb_aggregated_benchmarks',
          'company_data_network_consent'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_record.table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM public', table_record.table_name);

    IF table_record.table_name LIKE 'ai\_%' ESCAPE '\'
       AND EXISTS (
         SELECT 1
         FROM pg_class c2
         JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
         WHERE n2.nspname = 'public'
           AND c2.relname = table_record.table_name
           AND c2.relkind IN ('r', 'p')
       ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.table_name);
    END IF;
  END LOOP;
END $$;
