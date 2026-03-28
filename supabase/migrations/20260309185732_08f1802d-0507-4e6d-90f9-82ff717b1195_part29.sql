-- Check e aggiorna scadenze scadute (per cron o trigger)
CREATE OR REPLACE FUNCTION public.check_overdue_scadenze()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Nessun aggiornamento di status necessario: lo stato resta 'da_pagare'
  -- Questa funzione conta le scadenze scadute non pagate per monitoring
  SELECT COUNT(*) INTO v_count
  FROM scadenze
  WHERE status IN ('da_pagare', 'parziale')
    AND due_date < CURRENT_DATE;
  
  RETURN v_count;
END;
$$;
