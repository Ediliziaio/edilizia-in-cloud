-- Fix search_path on trigger functions (safe: skip if function does not exist yet)
DO $$ BEGIN
  ALTER FUNCTION public.validate_kb_sync_status() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
