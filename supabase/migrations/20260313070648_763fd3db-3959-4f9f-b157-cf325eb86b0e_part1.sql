CREATE TRIGGER trg_prima_nota_on_fattura_emessa
  AFTER UPDATE ON public.documenti_fiscali
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_prima_nota_fattura_emessa();
