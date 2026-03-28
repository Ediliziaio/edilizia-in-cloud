CREATE TRIGGER trg_contact_assigned
  AFTER UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_assigned();
