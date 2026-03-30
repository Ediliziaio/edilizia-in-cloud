-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_kb_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
