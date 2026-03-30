DROP TRIGGER IF EXISTS trg_marketing_opportunity_automation ON public.marketing_opportunities;
CREATE TRIGGER trg_marketing_opportunity_automation
  AFTER INSERT OR UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();
