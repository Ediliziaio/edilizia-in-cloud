-- 1. Create dedicated banking_set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.banking_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
