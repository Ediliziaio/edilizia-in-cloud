-- Function that checks RLS on newly created tables
DROP FUNCTION IF EXISTS public.check_new_table_rls() CASCADE;
CREATE OR REPLACE FUNCTION public.check_new_table_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE object_type = 'table'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = obj.objid
      AND n.nspname = 'public'
      AND c.relrowsecurity = true
    ) THEN
      INSERT INTO system_health_metrics (
        metric_type, function_name, error_message, metadata
      ) VALUES (
        'rls_missing',
        'ddl_trigger',
        'Tabella creata senza RLS: ' || obj.object_identity,
        jsonb_build_object('table_name', obj.object_identity, 'event', 'create_table')
      );
    END IF;
  END LOOP;
END;
$$;
