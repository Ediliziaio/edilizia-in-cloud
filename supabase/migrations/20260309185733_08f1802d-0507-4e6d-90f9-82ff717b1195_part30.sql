-- Trigger updated_at
DROP FUNCTION IF EXISTS public.trigger_set_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
