CREATE TRIGGER trg_prima_nota_on_incasso
  AFTER INSERT OR DELETE ON public.movimenti_cassa_native
  FOR EACH ROW EXECUTE FUNCTION public.fn_prima_nota_on_incasso();
