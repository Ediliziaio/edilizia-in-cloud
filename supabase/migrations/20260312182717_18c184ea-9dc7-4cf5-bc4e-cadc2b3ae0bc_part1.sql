-- Validation trigger instead of CHECK constraint
DROP FUNCTION IF EXISTS public.validate_billing_mode() CASCADE;
CREATE OR REPLACE FUNCTION public.validate_billing_mode()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_mode NOT IN ('external', 'native') THEN
    RAISE EXCEPTION 'Invalid billing_mode: %. Must be external or native.', NEW.billing_mode;
  END IF;
  RETURN NEW;
END;
$$;
