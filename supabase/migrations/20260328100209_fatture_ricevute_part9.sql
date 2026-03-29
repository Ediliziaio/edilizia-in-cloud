-- Trigger updated_at (usa trigger_set_updated_at come il resto del progetto)
CREATE OR REPLACE TRIGGER trg_fatture_ricevute_updated_at
  BEFORE UPDATE ON public.fatture_ricevute
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();
