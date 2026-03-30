-- 4. Trigger: update form stats on submission insert
DROP FUNCTION IF EXISTS public.fn_update_form_stats() CASCADE;
CREATE OR REPLACE FUNCTION public.fn_update_form_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lead_forms
  SET total_submissions = total_submissions + 1, updated_at = now()
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$;
