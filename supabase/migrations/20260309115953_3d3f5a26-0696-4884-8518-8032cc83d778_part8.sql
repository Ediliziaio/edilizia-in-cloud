CREATE TRIGGER quote_templates_updated_at
BEFORE UPDATE ON public.quote_templates
FOR EACH ROW EXECUTE FUNCTION public.set_quote_templates_updated_at();
