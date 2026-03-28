-- Saldo Prima Nota (entrate, uscite, netto) con filtro date opzionale
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
  v_entrate NUMERIC;
  v_uscite NUMERIC;
BEGIN
  -- Verify access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND company_id = p_company_id)
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Accesso negato');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'entrata' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'uscita' THEN amount ELSE 0 END), 0)
  INTO v_entrate, v_uscite
  FROM prima_nota_entries
  WHERE company_id = p_company_id
    AND (p_from_date IS NULL OR entry_date >= p_from_date)
    AND (p_to_date IS NULL OR entry_date <= p_to_date);

  RETURN json_build_object(
    'entrate', v_entrate,
    'uscite', v_uscite,
    'saldo', v_entrate - v_uscite
  );
END;
$$;
