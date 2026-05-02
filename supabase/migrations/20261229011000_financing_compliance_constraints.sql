-- Finanziamenti: vincoli economici/compliance e indici per uso operativo.

ALTER TABLE public.eic_tabelle_finanziamento
  DROP CONSTRAINT IF EXISTS eic_tabelle_tan_base_range,
  DROP CONSTRAINT IF EXISTS eic_tabelle_validita_coerente;

ALTER TABLE public.eic_tabelle_finanziamento
  ADD CONSTRAINT eic_tabelle_tan_base_range
  CHECK (tan_base IS NULL OR (tan_base >= 0 AND tan_base <= 100)),
  ADD CONSTRAINT eic_tabelle_validita_coerente
  CHECK (data_decorrenza IS NULL OR data_scadenza IS NULL OR data_scadenza >= data_decorrenza);

ALTER TABLE public.eic_tabelle_finanziamento_righe
  DROP CONSTRAINT IF EXISTS eic_righe_valori_non_negativi,
  DROP CONSTRAINT IF EXISTS eic_righe_totali_coerenti,
  DROP CONSTRAINT IF EXISTS eic_righe_tassi_range;

ALTER TABLE public.eic_tabelle_finanziamento_righe
  ADD CONSTRAINT eic_righe_valori_non_negativi
  CHECK (
    spese_istruttoria >= 0
    AND spese_incasso_rata >= 0
    AND interessi_cliente >= 0
    AND provvigione_dealer >= 0
    AND (icc IS NULL OR icc >= 0)
  ),
  ADD CONSTRAINT eic_righe_totali_coerenti
  CHECK (
    importo_totale_credito >= importo_erogato
    AND importo_totale_dovuto >= importo_totale_credito
  ),
  ADD CONSTRAINT eic_righe_tassi_range
  CHECK (
    tan >= 0 AND tan <= 100
    AND taeg >= 0 AND taeg <= 100
    AND (icc IS NULL OR icc <= 100)
  );

CREATE INDEX IF NOT EXISTS idx_eic_tabelle_validita
  ON public.eic_tabelle_finanziamento (company_id, data_scadenza, attiva);

CREATE INDEX IF NOT EXISTS idx_eic_righe_taeg
  ON public.eic_tabelle_finanziamento_righe (tabella_id, taeg);
