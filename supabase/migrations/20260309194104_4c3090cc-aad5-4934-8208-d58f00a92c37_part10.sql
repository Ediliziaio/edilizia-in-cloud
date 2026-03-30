-- 4. Updated check_overdue_scadenze to also return alert-worthy scadenze
CREATE OR REPLACE FUNCTION public.check_overdue_and_upcoming_scadenze(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overdue JSON;
  v_upcoming JSON;
  v_result JSON;
BEGIN
  -- Overdue scadenze
  SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
  INTO v_overdue
  FROM (
    SELECT id, description, amount, paid_amount, due_date, tipo, direction,
           (amount - paid_amount) as remaining
    FROM scadenze
    WHERE company_id = p_company_id
    AND status IN ('da_pagare', 'parziale')
    AND due_date < CURRENT_DATE
    ORDER BY due_date ASC
    LIMIT 50
  ) s;
  
  -- Upcoming scadenze (next 7 days by default, uses alert_days_before)
  SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
  INTO v_upcoming
  FROM (
    SELECT id, description, amount, paid_amount, due_date, tipo, direction,
           alert_days_before, alert_sent_at,
           (amount - paid_amount) as remaining,
           (due_date - CURRENT_DATE) as days_until
    FROM scadenze
    WHERE company_id = p_company_id
    AND status IN ('da_pagare', 'parziale')
    AND due_date >= CURRENT_DATE
    AND due_date <= CURRENT_DATE + alert_days_before
    AND (alert_sent_at IS NULL OR alert_sent_at < CURRENT_DATE - 1)
    ORDER BY due_date ASC
    LIMIT 50
  ) s;
  
  v_result := json_build_object(
    'overdue', v_overdue,
    'upcoming', v_upcoming,
    'overdue_count', (SELECT COUNT(*) FROM scadenze WHERE company_id = p_company_id AND status IN ('da_pagare', 'parziale') AND due_date < CURRENT_DATE),
    'upcoming_count', json_array_length(v_upcoming)
  );
  
  RETURN v_result;
END;
$$;
