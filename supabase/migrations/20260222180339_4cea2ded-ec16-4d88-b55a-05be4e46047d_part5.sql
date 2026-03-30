DROP TRIGGER IF EXISTS trg_opportunity_created ON public.marketing_opportunities;
CREATE TRIGGER trg_opportunity_created
  AFTER INSERT ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_opportunity_created();
