-- Vista cohort revenue per analisi retention
-- Nota: subscription_logs non ha 'importo_cents' — la view calcola la presenza
-- come indicatore di attività, non revenue assoluto
CREATE OR REPLACE VIEW cohort_revenue_view AS
SELECT
  DATE_TRUNC('month', c.created_at)::DATE AS cohort_mese,
  DATE_TRUNC('month', sl.created_at)::DATE AS mese_attivita,
  EXTRACT(YEAR FROM AGE(
    DATE_TRUNC('month', sl.created_at),
    DATE_TRUNC('month', c.created_at)
  ))::INT * 12 +
  EXTRACT(MONTH FROM AGE(
    DATE_TRUNC('month', sl.created_at),
    DATE_TRUNC('month', c.created_at)
  ))::INT AS mesi_dalla_iscrizione,
  COUNT(DISTINCT sl.company_id) AS aziende_attive,
  COUNT(*) AS eventi_totali
FROM subscription_logs sl
JOIN companies c ON c.id = sl.company_id
WHERE sl.event_type IN ('activated', 'renewed', 'plan_changed', 'upgraded')
GROUP BY 1, 2, 3
ORDER BY 1, 3;

-- Commento esplicativo
COMMENT ON VIEW cohort_revenue_view IS 'Cohort analysis: aziende attive per mese di iscrizione e mese di attività';
