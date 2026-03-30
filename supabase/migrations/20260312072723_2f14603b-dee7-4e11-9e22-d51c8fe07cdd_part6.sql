DROP TRIGGER IF EXISTS subscription_invoices_updated_at ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
