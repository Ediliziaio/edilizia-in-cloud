DROP TRIGGER IF EXISTS set_updated_at ON public.documenti_fiscali;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.documenti_fiscali
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();
