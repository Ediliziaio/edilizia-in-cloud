-- Summary scadenzario per KPI cards
DROP FUNCTION IF EXISTS public.get_scadenzario_summary(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_scadenzario_summary(
  p_company_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Verify access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND company_id = p_company_id)
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Accesso negato');
  END IF;

  SELECT json_build_object(
    'scadute_count', COUNT(*) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date < CURRENT_DATE),
    'scadute_amount', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date < CURRENT_DATE), 0),
    'questa_settimana_count', COUNT(*) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7),
    'questa_settimana_amount', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7), 0),
    'prossimi_30gg_count', COUNT(*) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30),
    'prossimi_30gg_amount', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30), 0),
    'entrate_attese', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND direction = 'entrata'), 0),
    'uscite_attese', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND direction = 'uscita'), 0)
  ) INTO v_result
  FROM scadenze
  WHERE company_id = p_company_id;

  RETURN v_result;
END;
$$;
