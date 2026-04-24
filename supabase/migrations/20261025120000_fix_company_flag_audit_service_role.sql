-- Bug fix critico: il trigger log_company_flag_changes su companies usava
-- COALESCE(auth.uid(), '00000000-...') ma il FK
-- company_flag_audit_log.changed_by → auth.users(id) non può essere
-- soddisfatto da un UUID inesistente.
--
-- Risultato: QUALUNQUE update su companies fatto con service role
-- (es. edge function admin-change-plan) falliva con violazione FK:
-- "Key (changed_by)=(00000000-0000-0000-0000-000000000000) is not present
--  in table users".
--
-- Fix:
--   1. Rendere changed_by nullable (non distruttivo, le righe esistenti
--      restano coerenti).
--   2. Riscrivere il trigger per passare auth.uid() puro (può essere NULL
--      quando invocato da service role). Così l'audit log mantiene
--      tracciabilità quando c'è un utente JWT e NULL quando è operazione
--      automatica server-side.
--   3. Il FK continua a validare che se changed_by è valorizzato, l'utente
--      esista davvero.

BEGIN;

ALTER TABLE public.company_flag_audit_log
  ALTER COLUMN changed_by DROP NOT NULL;

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

  IF OLD.billing_status IS DISTINCT FROM NEW.billing_status THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, v_user, 'billing_status',
            to_jsonb(OLD.billing_status::text), to_jsonb(NEW.billing_status::text));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
