DROP TRIGGER IF EXISTS trg_prima_nota_updated_at ON public.prima_nota_entries;
CREATE TRIGGER trg_prima_nota_updated_at
  BEFORE UPDATE ON public.prima_nota_entries
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
