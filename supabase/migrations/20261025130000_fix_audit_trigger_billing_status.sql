-- Bug fix: il trigger log_company_flag_changes referenziava
-- OLD.billing_status / NEW.billing_status ma la colonna billing_status
-- non esiste su companies (esiste invece billing_mode + dunning_status).
--
-- Causa: la migration originale creava il trigger assumendo una colonna
-- che non è mai stata aggiunta (o è stata rinominata dopo).
--
-- Effetto: QUALUNQUE update su companies falliva con
--   ERROR: record "old" has no field "billing_status" (42703)
--
-- Fix: rimuoviamo il ramo billing_status dal trigger. Manteniamo
-- subscription_plan_id e status che sono quelli effettivamente critici.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_company_flag_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();

  IF OLD.subscription_plan_id IS DISTINCT FROM NEW.subscription_plan_id THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, v_user, 'subscription_plan_id',
            to_jsonb(OLD.subscription_plan_id), to_jsonb(NEW.subscription_plan_id));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, v_user, 'status',
            to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));
  END IF;

  -- Track dunning_status (real column name) instead of non-existent billing_status
  IF OLD.dunning_status IS DISTINCT FROM NEW.dunning_status THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, v_user, 'dunning_status',
            to_jsonb(OLD.dunning_status), to_jsonb(NEW.dunning_status));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
