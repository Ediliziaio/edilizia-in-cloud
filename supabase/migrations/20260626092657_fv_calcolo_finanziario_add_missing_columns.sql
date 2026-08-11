-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- Aggiunge le colonne referenziate da fv-genera-pdf v46 ma mai create nel DB.
-- scenario_completo: blob JSONB legacy (Sprint 1/2) con dati finanziamento.
-- risparmio_anno1_eur, risparmio_25_anni_eur, npv_25_anni_eur: metriche
-- selezionate dalla query ma il cui valore reale viene da fv_progetti
-- (risparmio_anno1 / npv_25_anni). Nullable → compatibili con righe esistenti.
ALTER TABLE fv_calcolo_finanziario
  ADD COLUMN IF NOT EXISTS scenario_completo      JSONB,
  ADD COLUMN IF NOT EXISTS risparmio_anno1_eur    FLOAT8,
  ADD COLUMN IF NOT EXISTS risparmio_25_anni_eur  FLOAT8,
  ADD COLUMN IF NOT EXISTS npv_25_anni_eur        FLOAT8;
