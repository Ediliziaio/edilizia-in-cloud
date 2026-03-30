-- Trigger updated_at
DROP FUNCTION IF EXISTS public.update_automation_rules_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
