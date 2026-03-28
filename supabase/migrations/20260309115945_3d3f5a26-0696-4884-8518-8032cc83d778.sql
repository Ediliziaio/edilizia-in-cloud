-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_quote_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
