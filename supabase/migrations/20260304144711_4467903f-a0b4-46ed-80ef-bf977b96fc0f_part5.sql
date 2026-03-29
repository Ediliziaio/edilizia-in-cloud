-- Attach triggers to marketing tables
CREATE TRIGGER trg_marketing_contact_automation
  AFTER INSERT OR UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();
