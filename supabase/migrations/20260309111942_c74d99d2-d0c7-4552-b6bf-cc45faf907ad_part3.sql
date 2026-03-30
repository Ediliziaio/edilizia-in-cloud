DROP TRIGGER IF EXISTS trg_log_quote_status_change ON public.quotes;
CREATE TRIGGER trg_log_quote_status_change
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_quote_status_change();
