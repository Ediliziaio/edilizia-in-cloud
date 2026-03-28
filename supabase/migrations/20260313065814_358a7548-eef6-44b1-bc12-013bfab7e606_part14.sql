CREATE TRIGGER trg_update_fattura_stato_on_movimento
  AFTER INSERT OR UPDATE OR DELETE ON public.movimenti_cassa_native
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fattura_stato_on_movimento();
