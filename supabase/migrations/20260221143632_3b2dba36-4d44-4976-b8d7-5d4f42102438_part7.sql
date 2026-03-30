-- Updated_at trigger
DROP TRIGGER IF EXISTS update_marketing_contacts_updated_at ON public.marketing_contacts;
CREATE TRIGGER update_marketing_contacts_updated_at
BEFORE UPDATE ON public.marketing_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
