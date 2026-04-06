-- MP4: Rapportini Digitali upgrade
-- Aggiunge: stato workflow, firma operaio, ore straordinario, motivo rifiuto, pdf_url

ALTER TABLE campo_rapportini
  ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza','inviato','approvato','rifiutato')),
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS firma_operaio_url TEXT,
  ADD COLUMN IF NOT EXISTS ore_straordinario NUMERIC(4,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_rifiuto TEXT;

-- Migra i record già approvati
UPDATE campo_rapportini
SET stato = 'approvato'
WHERE approvato = true AND stato = 'bozza';

-- Migra i record inviati (non ancora approvati, non bozza) — quelli che già esistono
-- li consideriamo "inviati" se non erano ancora approvati
UPDATE campo_rapportini
SET stato = 'inviato'
WHERE approvato = false AND stato = 'bozza';

-- Indice per filtri frequenti (stato, company_id)
CREATE INDEX IF NOT EXISTS idx_campo_rapportini_stato
  ON campo_rapportini (company_id, stato);

CREATE INDEX IF NOT EXISTS idx_campo_rapportini_pdf
  ON campo_rapportini (id) WHERE pdf_url IS NULL;
