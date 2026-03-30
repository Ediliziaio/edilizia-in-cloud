DROP TRIGGER IF EXISTS update_marketing_pipelines_updated_at ON public.marketing_pipelines;
CREATE TRIGGER update_marketing_pipelines_updated_at
  BEFORE UPDATE ON public.marketing_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
