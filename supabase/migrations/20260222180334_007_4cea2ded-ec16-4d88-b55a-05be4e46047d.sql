CREATE TRIGGER trg_opportunity_updates
  AFTER UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_opportunity_updates();
