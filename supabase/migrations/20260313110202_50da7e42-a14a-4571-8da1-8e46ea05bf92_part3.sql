-- ============================================================
-- FUNZIONE: get_callcenter_trend_giornaliero
-- ============================================================
DROP FUNCTION IF EXISTS public.get_callcenter_trend_giornaliero(UUID, DATE, DATE, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_callcenter_trend_giornaliero(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_operatore_id UUID DEFAULT NULL
)
RETURNS TABLE(
  giorno DATE,
  giorno_label TEXT,
  giorno_settimana TEXT,
  nr_chiamate BIGINT,
  nr_contatti BIGINT,
  nr_appuntamenti BIGINT,
  tasso_contatto NUMERIC,
  tasso_appuntamento NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.d::DATE,
    TO_CHAR(d.d, 'DD/MM')::TEXT,
    TO_CHAR(d.d, 'Dy')::TEXT,
    COUNT(DISTINCT cl.id) AS nr_chiam,
    COUNT(DISTINCT cl.id) FILTER (WHERE cl.outcome = 'answered') AS nr_cont,
    COUNT(DISTINCT apt.id) AS nr_app,
    ROUND(100.0 * COUNT(DISTINCT cl.id) FILTER (WHERE cl.outcome = 'answered')
      / NULLIF(COUNT(DISTINCT cl.id), 0), 1),
    ROUND(100.0 * COUNT(DISTINCT apt.id)
      / NULLIF(COUNT(DISTINCT cl.id) FILTER (WHERE cl.outcome = 'answered'), 0), 1)
  FROM generate_series(p_data_inizio::timestamptz, p_data_fine::timestamptz, '1 day') d(d)
  LEFT JOIN call_logs cl ON
    cl.started_at::DATE = d.d::DATE
    AND cl.company_id = p_company_id
    AND (p_operatore_id IS NULL OR cl.user_id = p_operatore_id)
  LEFT JOIN appointments apt ON
    apt.created_at::DATE = d.d::DATE
    AND apt.company_id = p_company_id
    AND (p_operatore_id IS NULL OR apt.created_by = p_operatore_id)
  GROUP BY d.d
  ORDER BY d.d;
END;
$$;
