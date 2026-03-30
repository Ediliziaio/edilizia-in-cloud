-- 10. check_overdue_scadenze - Fix per usare status corretto
DROP FUNCTION IF EXISTS public.check_overdue_scadenze(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.check_overdue_scadenze(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM scadenze
  WHERE company_id = p_company_id
    AND status = 'da_pagare'
    AND due_date < CURRENT_DATE;

  RETURN json_build_object('overdue_count', v_count);
END;
$$;
