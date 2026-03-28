-- 5. Trigger: update form stats on view insert
CREATE OR REPLACE FUNCTION public.fn_update_form_views()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lead_forms
  SET total_views = total_views + 1
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$;
