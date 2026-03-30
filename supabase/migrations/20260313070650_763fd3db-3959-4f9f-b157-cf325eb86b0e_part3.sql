DROP TRIGGER IF EXISTS trg_prima_nota_on_incasso ON public.movimenti_cassa_native;
CREATE TRIGGER trg_prima_nota_on_incasso
  AFTER INSERT ON public.movimenti_cassa_native
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_prima_nota_incasso();
