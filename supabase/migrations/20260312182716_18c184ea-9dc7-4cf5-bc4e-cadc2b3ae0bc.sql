
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS billing_mode_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_mode_set_by UUID;

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_billing_mode()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_mode NOT IN ('external', 'native') THEN
    RAISE EXCEPTION 'Invalid billing_mode: %. Must be external or native.', NEW.billing_mode;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_billing_mode ON public.companies;
CREATE TRIGGER trg_validate_billing_mode
  BEFORE INSERT OR UPDATE OF billing_mode ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_billing_mode();
