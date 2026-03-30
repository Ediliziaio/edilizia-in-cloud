DROP TRIGGER IF EXISTS trg_validate_billing_mode ON public.companies;
CREATE TRIGGER trg_validate_billing_mode
  BEFORE INSERT OR UPDATE OF billing_mode ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_billing_mode();
