-- Scadenzario: il riepilogo (get_scadenzario_summary) ora accetta un range date
-- opzionale (p_date_from / p_date_to) per scopare i KPI all'anno selezionato in UI,
-- invece di mostrare il cumulato di tutti gli anni. Default NULL = comportamento storico.
-- Cambio di firma → DROP del vecchio 1-arg + CREATE del nuovo (chiamato solo dall'hook
-- useScadenzario). Già applicato a prod via MCP.

DROP FUNCTION IF EXISTS public.get_scadenzario_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_scadenzario_summary(
  p_company_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'uscite_previste', COALESCE(SUM(CASE WHEN direction = 'uscita' AND status IN ('da_pagare','parziale') THEN amount - paid_amount ELSE 0 END), 0),
    -- Conteggi per i tab della UI (rispettano lo stesso scope anno).
    'tutte_count', COALESCE(SUM(1), 0),
    'da_incassare_count', COALESCE(SUM(CASE WHEN direction = 'entrata' AND status IN ('da_pagare','parziale') THEN 1 ELSE 0 END), 0),
    'da_pagare_count', COALESCE(SUM(CASE WHEN direction = 'uscita' AND status IN ('da_pagare','parziale') THEN 1 ELSE 0 END), 0),
    'pagate_count', COALESCE(SUM(CASE WHEN status = 'pagata' THEN 1 ELSE 0 END), 0)
  ) INTO v_result
  FROM scadenze
  WHERE company_id = p_company_id
    AND status NOT IN ('annullata')
    AND (p_date_from IS NULL OR due_date >= p_date_from)
    AND (p_date_to IS NULL OR due_date <= p_date_to);

  RETURN v_result;
END;
$function$;
