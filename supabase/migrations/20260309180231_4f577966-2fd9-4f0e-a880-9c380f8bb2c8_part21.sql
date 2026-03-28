CREATE TRIGGER trg_update_form_stats
  AFTER INSERT ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_form_stats();
