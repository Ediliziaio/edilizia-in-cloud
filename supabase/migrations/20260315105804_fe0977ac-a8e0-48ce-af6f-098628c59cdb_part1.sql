DO $$ BEGIN
  ALTER FUNCTION public.set_kb_updated_at() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
