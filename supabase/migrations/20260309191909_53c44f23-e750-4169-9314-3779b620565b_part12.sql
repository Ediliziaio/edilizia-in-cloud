-- 8. get_prima_nota_saldo - Fix con entry_count
DROP FUNCTION IF EXISTS public.get_prima_nota_saldo(UUID, DATE, DATE) CASCADE;
CREATE OR REPLACE FUNCTION public.get_prima_nota_saldo(
  p_company_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrate NUMERIC := 0;
  v_uscite NUMERIC := 0;
  v_count BIGINT := 0;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN direction = 'entrata' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'uscita' THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_entrate, v_uscite, v_count
  FROM prima_nota_entries
  WHERE company_id = p_company_id
    AND (p_from_date IS NULL OR entry_date >= p_from_date)
    AND (p_to_date IS NULL OR entry_date <= p_to_date);

  RETURN json_build_object(
    'entrate', v_entrate,
    'uscite', v_uscite,
    'saldo', v_entrate - v_uscite,
    'entry_count', v_count
  );
END;
$$;
