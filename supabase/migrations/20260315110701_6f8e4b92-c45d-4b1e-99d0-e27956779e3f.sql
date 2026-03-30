
-- Fix search_path on trigger function
DROP FUNCTION IF EXISTS public.trg_campaigns_v2_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.trg_campaigns_v2_updated_at()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.aggiornato_il := now();
  RETURN NEW;
END;
$$;
