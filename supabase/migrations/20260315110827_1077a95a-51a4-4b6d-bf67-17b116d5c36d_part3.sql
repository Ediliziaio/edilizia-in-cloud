CREATE TRIGGER set_campaigns_v2_updated_at
  BEFORE UPDATE ON public.ai_campaigns_v2
  FOR EACH ROW EXECUTE FUNCTION public.trg_campaigns_v2_updated_at();
