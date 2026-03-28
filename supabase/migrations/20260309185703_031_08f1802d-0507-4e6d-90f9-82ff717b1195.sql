CREATE TRIGGER trg_scadenze_updated_at
  BEFORE UPDATE ON public.scadenze
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
