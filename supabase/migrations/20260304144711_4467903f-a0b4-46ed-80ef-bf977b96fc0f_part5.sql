-- Attach triggers to marketing tables
DROP TRIGGER IF EXISTS trg_marketing_contact_automation ON public.marketing_contacts;
CREATE TRIGGER trg_marketing_contact_automation
  AFTER INSERT OR UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.fire_marketing_automation();
