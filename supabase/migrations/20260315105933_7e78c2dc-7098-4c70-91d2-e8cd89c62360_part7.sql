-- updated_at trigger
DROP FUNCTION IF EXISTS public.set_kb_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.set_kb_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
