DROP TRIGGER IF EXISTS quote_templates_updated_at ON public.quote_templates;
CREATE TRIGGER quote_templates_updated_at
BEFORE UPDATE ON public.quote_templates
FOR EACH ROW EXECUTE FUNCTION public.set_quote_templates_updated_at();
