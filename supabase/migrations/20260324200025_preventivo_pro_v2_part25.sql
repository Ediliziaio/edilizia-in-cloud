-- ━━━ BLOCCO F: ESTENDI quote_items ━━━
-- item_category: classificazione dettagliata della riga preventivo.
-- Coesiste con item_type (legacy, sempre='product') — il nuovo codice usa item_category.
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS item_category TEXT DEFAULT 'prodotto'
    CHECK (item_category IN (
      'prodotto','posa','trasporto','tiro_piano',
      'smaltimento','nolo','pratica','sconto','nota','subtotale'
    )),
  ADD COLUMN IF NOT EXISTS tariffa_id UUID
    REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL,
  -- parent_item_id: collega righe posa/smaltimento al prodotto padre
  ADD COLUMN IF NOT EXISTS parent_item_id UUID
    REFERENCES public.quote_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prezzo_acquisto    NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_importo   NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margine_percentuale NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mostra_nel_pdf     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_optional        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}',
  -- Per prodotti a griglia: dimensioni inserite dall'utente nel QuoteBuilder
  ADD COLUMN IF NOT EXISTS misura_x INTEGER,  -- larghezza in mm
  ADD COLUMN IF NOT EXISTS misura_y INTEGER;
