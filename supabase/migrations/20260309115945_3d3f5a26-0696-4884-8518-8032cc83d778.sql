-- Updated_at trigger function
DROP FUNCTION IF EXISTS public.set_quote_templates_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.set_quote_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
