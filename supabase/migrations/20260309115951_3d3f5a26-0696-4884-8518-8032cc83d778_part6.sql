DROP FUNCTION IF EXISTS public.enforce_single_default_template() CASCADE;
CREATE OR REPLACE FUNCTION public.enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.quote_templates
    SET is_default = false
    WHERE company_id = NEW.company_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
