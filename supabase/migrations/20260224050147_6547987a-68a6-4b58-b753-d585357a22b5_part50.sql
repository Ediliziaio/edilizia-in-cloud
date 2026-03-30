DROP TRIGGER IF EXISTS update_integration_credentials_updated_at ON public.integration_credentials;
CREATE TRIGGER update_integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
