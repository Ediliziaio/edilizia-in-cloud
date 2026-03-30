-- 6. Trigger auto-assign oda_number
CREATE OR REPLACE FUNCTION public.auto_assign_oda_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num TEXT;
BEGIN
  IF NEW.oda_number IS NULL OR NEW.oda_number = '' THEN
    SELECT public.generate_oda_number(NEW.company_id) INTO v_num;
    NEW.oda_number := v_num;
  END IF;
  RETURN NEW;
END;
$$;
