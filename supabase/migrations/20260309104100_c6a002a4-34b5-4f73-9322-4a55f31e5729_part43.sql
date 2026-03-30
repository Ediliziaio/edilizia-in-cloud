-- 6. generate_quote_number() — progressive OFF-YYYY-NNN
DROP FUNCTION IF EXISTS public.generate_quote_number(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.generate_quote_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM now())::TEXT;
  v_count INTEGER;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.quotes
  WHERE company_id = p_company_id
    AND quote_number LIKE 'OFF-' || v_year || '-%';

  v_number := 'OFF-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN v_number;
END;
$$;
