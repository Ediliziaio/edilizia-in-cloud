-- 9. get_scadenzario_summary - Fix con campi aggiuntivi
CREATE OR REPLACE FUNCTION public.get_scadenzario_summary(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'scadute_count', COALESCE(SUM(CASE WHEN status = 'da_pagare' AND due_date < CURRENT_DATE THEN 1 ELSE 0 END), 0),
    'scadute_amount', COALESCE(SUM(CASE WHEN status = 'da_pagare' AND due_date < CURRENT_DATE THEN amount - paid_amount ELSE 0 END), 0),
    'questa_settimana_count', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN 1 ELSE 0 END), 0),
    'questa_settimana_amount', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN amount - paid_amount ELSE 0 END), 0),
    'prossimi_30gg_count', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 THEN 1 ELSE 0 END), 0),
    'prossimi_30gg_amount', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 THEN amount - paid_amount ELSE 0 END), 0),
    'questo_mese_count', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0),
    'questo_mese_amount', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE) THEN amount - paid_amount ELSE 0 END), 0),
    'entrate_previste', COALESCE(SUM(CASE WHEN direction = 'entrata' AND status IN ('da_pagare','parziale') THEN amount - paid_amount ELSE 0 END), 0),
    'uscite_previste', COALESCE(SUM(CASE WHEN direction = 'uscita' AND status IN ('da_pagare','parziale') THEN amount - paid_amount ELSE 0 END), 0)
  ) INTO v_result
  FROM scadenze
  WHERE company_id = p_company_id
    AND status NOT IN ('annullata');

  RETURN v_result;
END;
$$;
