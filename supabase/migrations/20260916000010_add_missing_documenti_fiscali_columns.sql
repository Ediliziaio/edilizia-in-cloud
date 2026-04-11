-- ============================================================
-- Add missing columns to documenti_fiscali
-- The editor (useEditorState) references these columns but
-- they were never created by any prior migration, causing
-- "Could not find column in schema cache" errors on autosave.
-- ============================================================

-- ═══ Altra Ritenuta (e.g. Enasarco, ENPAM, etc.) ═══
ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS altra_ritenuta BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS altra_ritenuta_tipo TEXT,
  ADD COLUMN IF NOT EXISTS altra_ritenuta_aliquota DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS altra_ritenuta_causale TEXT,
  ADD COLUMN IF NOT EXISTS altra_ritenuta_importo DECIMAL(15,2);

-- ═══ Rivalsa INPS (gestione separata) ═══
ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS rivalsa_inps BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rivalsa_tipo TEXT,
  ADD COLUMN IF NOT EXISTS rivalsa_aliquota DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS rivalsa_importo DECIMAL(15,2);

-- ═══ Fatturazione Elettronica: esigibilità IVA, allegato PDF, causale emissione ═══
ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS esigibilita_iva TEXT DEFAULT 'I',
  ADD COLUMN IF NOT EXISTS allega_pdf_sdi BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS emesso_in_seguito_a TEXT;
