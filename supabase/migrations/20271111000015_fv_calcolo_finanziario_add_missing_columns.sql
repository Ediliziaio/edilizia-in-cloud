-- Aggiunge colonne mancanti a fv_calcolo_finanziario richieste da fv-genera-pdf
-- scenario_completo: fallback legacy per dati finanziamento
-- risparmio_anno1_eur, risparmio_25_anni_eur, npv_25_anni_eur: nuovi nomi colonne (SELECT in fv-genera-pdf v46+)
ALTER TABLE fv_calcolo_finanziario
  ADD COLUMN IF NOT EXISTS scenario_completo      JSONB,
  ADD COLUMN IF NOT EXISTS risparmio_anno1_eur    FLOAT8,
  ADD COLUMN IF NOT EXISTS risparmio_25_anni_eur  FLOAT8,
  ADD COLUMN IF NOT EXISTS npv_25_anni_eur        FLOAT8;
