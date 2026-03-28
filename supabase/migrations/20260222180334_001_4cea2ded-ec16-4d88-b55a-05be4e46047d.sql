CREATE TRIGGER trg_contact_created
  AFTER INSERT ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_created();
