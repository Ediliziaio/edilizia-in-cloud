DROP TRIGGER IF EXISTS set_quote_expires_at ON public.quotes;
CREATE TRIGGER set_quote_expires_at
BEFORE INSERT OR UPDATE OF validity_days ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.calculate_quote_expires_at();
