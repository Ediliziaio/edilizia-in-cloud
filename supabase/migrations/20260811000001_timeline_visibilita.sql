-- Modulo A: Aggiunge controllo visibilità sul giornale lavori
-- (ordini_variazione.visibile_cliente esiste già)

ALTER TABLE giornale_lavori
  ADD COLUMN IF NOT EXISTS visibile_cliente BOOLEAN DEFAULT true;

-- Index per performance query portale cliente
CREATE INDEX IF NOT EXISTS idx_giornale_lavori_order_cliente
  ON giornale_lavori(order_id, visibile_cliente);

CREATE INDEX IF NOT EXISTS idx_sal_records_order
  ON sal_records(order_id, stato);
