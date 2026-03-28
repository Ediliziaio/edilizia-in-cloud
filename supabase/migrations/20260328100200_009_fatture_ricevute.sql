-- Trigger updated_at
CREATE OR REPLACE TRIGGER trg_fatture_ricevute_updated_at
  BEFORE UPDATE ON public.fatture_ricevute
  FOR EACH ROW
  EXECUTE FUNCTION public.moddatetime('updated_at');
