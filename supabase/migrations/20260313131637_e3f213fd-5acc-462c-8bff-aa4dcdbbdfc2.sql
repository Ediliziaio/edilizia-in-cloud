
-- Fix search_path on trigger function
DROP FUNCTION IF EXISTS public.update_automation_rules_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_automation_rules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
