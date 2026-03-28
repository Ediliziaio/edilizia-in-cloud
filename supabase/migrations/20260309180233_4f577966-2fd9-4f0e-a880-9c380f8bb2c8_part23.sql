CREATE TRIGGER trg_update_form_views
  AFTER INSERT ON public.form_views
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_form_views();
