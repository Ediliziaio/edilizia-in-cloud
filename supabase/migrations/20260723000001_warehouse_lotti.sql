-- warehouse_lotti: gestione lotti di magazzino
-- BLOCCO C — Step 1

CREATE TABLE IF NOT EXISTS warehouse_lotti (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  numero_lotto    text NOT NULL,
  articolo        text NOT NULL,
  fornitore       text,
  quantita        numeric(12, 3) NOT NULL DEFAULT 0,
  unita_misura    text DEFAULT 'pz',
  data_scadenza   date,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS warehouse_lotti_company_id_idx ON warehouse_lotti(company_id);
CREATE INDEX IF NOT EXISTS warehouse_lotti_data_scadenza_idx ON warehouse_lotti(data_scadenza);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_warehouse_lotti_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warehouse_lotti_updated_at ON warehouse_lotti;
CREATE TRIGGER trg_warehouse_lotti_updated_at
  BEFORE UPDATE ON warehouse_lotti
  FOR EACH ROW EXECUTE FUNCTION update_warehouse_lotti_updated_at();

-- RLS
ALTER TABLE warehouse_lotti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse_lotti_company_isolation"
  ON warehouse_lotti
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );
