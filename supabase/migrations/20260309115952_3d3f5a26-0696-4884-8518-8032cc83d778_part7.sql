CREATE TRIGGER single_default_template
BEFORE INSERT OR UPDATE ON public.quote_templates
FOR EACH ROW WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.enforce_single_default_template();
