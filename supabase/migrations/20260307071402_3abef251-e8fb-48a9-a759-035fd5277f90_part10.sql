DROP TRIGGER IF EXISTS trg_init_email_credits ON public.companies;
CREATE TRIGGER trg_init_email_credits
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.init_company_email_credits();
