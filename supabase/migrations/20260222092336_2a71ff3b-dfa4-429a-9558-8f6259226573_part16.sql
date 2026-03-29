CREATE TRIGGER update_marketing_opportunities_updated_at
  BEFORE UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
