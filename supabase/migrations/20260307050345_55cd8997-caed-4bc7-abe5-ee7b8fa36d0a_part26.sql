DROP TRIGGER IF EXISTS t_company_credits ON public.companies;
CREATE TRIGGER t_company_credits AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.init_company_credits();
