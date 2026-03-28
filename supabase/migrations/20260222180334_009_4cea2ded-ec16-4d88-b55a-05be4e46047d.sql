CREATE TRIGGER trg_note_added
  AFTER INSERT ON public.marketing_contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_note_added();
