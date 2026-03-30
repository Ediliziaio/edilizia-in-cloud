-- Updated_at trigger for lists
DROP TRIGGER IF EXISTS update_marketing_contact_lists_updated_at ON public.marketing_contact_lists;
CREATE TRIGGER update_marketing_contact_lists_updated_at
  BEFORE UPDATE ON public.marketing_contact_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
