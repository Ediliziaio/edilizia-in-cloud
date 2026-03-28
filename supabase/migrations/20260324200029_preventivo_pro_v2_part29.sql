-- ━━━ BLOCCO G: ESTENDI quotes ━━━
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tipo_lavoro TEXT,
  ADD COLUMN IF NOT EXISTS indirizzo_lavori TEXT,
  ADD COLUMN IF NOT EXISTS piano_installazione INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_cantiere NUMERIC(8,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}',
  -- Totali costo interno — visibili solo agli admin nel QuoteBuilder
  ADD COLUMN IF NOT EXISTS totale_costo_interno    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totale_overhead         NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margine_totale_percentuale NUMERIC(5,2) DEFAULT 0;
