-- =============================================
-- 2E. FUNZIONE: Generazione numero OdA automatico
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_oda_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM purchase_orders
  WHERE company_id = p_company_id
    AND oda_number LIKE 'ODA-' || v_year || '-%';
  
  RETURN 'ODA-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$;
