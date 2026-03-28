-- ============================================================
-- FUNZIONE: get_callcenter_speed_to_lead_distribuzione
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_callcenter_speed_to_lead_distribuzione(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_operatore_id UUID DEFAULT NULL
)
RETURNS TABLE(
  bucket TEXT,
  bucket_ordine INTEGER,
  nr_lead BIGINT,
  pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH buckets AS (
    SELECT
      CASE
        WHEN lj.speed_to_lead_minuti IS NULL        THEN 'Non chiamato'
        WHEN lj.speed_to_lead_minuti <= 5            THEN '0-5 min'
        WHEN lj.speed_to_lead_minuti <= 30           THEN '5-30 min'
        WHEN lj.speed_to_lead_minuti <= 60           THEN '30-60 min'
        WHEN lj.speed_to_lead_minuti <= 240          THEN '1-4 ore'
        WHEN lj.speed_to_lead_minuti <= 1440         THEN '4-24 ore'
        ELSE 'Oltre 24 ore'
      END AS bkt,
      CASE
        WHEN lj.speed_to_lead_minuti IS NULL        THEN 7
        WHEN lj.speed_to_lead_minuti <= 5            THEN 1
        WHEN lj.speed_to_lead_minuti <= 30           THEN 2
        WHEN lj.speed_to_lead_minuti <= 60           THEN 3
        WHEN lj.speed_to_lead_minuti <= 240          THEN 4
        WHEN lj.speed_to_lead_minuti <= 1440         THEN 5
        ELSE 6
      END AS ord,
      COUNT(*) AS cnt
    FROM callcenter_lead_journey lj
    WHERE lj.company_id = p_company_id
      AND lj.lead_created_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR lj.operatore_assegnato = p_operatore_id)
    GROUP BY 1, 2
  ),
  totale AS (SELECT SUM(cnt) AS t FROM buckets)
  SELECT b.bkt, b.ord, b.cnt, ROUND(100.0 * b.cnt / NULLIF(t.t, 0), 1)
  FROM buckets b, totale t
  ORDER BY b.ord;
END;
$$;
