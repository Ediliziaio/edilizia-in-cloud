-- Estende quote_templates con controlli tipografici avanzati richiesti
-- per personalizzare dimensioni font, altezza riga, densità tabella,
-- zebra striping, allineamento header, ecc.

BEGIN;

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS font_size_base INT NOT NULL DEFAULT 10
    CHECK (font_size_base BETWEEN 7 AND 16),
  ADD COLUMN IF NOT EXISTS heading_size_scale NUMERIC(3,2) NOT NULL DEFAULT 1.60
    CHECK (heading_size_scale BETWEEN 1.00 AND 3.00),
  ADD COLUMN IF NOT EXISTS line_height NUMERIC(3,2) NOT NULL DEFAULT 1.40
    CHECK (line_height BETWEEN 1.00 AND 2.50),
  ADD COLUMN IF NOT EXISTS row_density TEXT NOT NULL DEFAULT 'normal'
    CHECK (row_density IN ('compact', 'normal', 'comfortable')),
  ADD COLUMN IF NOT EXISTS table_zebra BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS table_borders TEXT NOT NULL DEFAULT 'horizontal'
    CHECK (table_borders IN ('none', 'horizontal', 'all')),
  ADD COLUMN IF NOT EXISTS header_alignment TEXT NOT NULL DEFAULT 'left'
    CHECK (header_alignment IN ('left', 'center', 'right')),
  ADD COLUMN IF NOT EXISTS page_margin_mm INT NOT NULL DEFAULT 18
    CHECK (page_margin_mm BETWEEN 8 AND 30);

COMMENT ON COLUMN public.quote_templates.font_size_base IS 'Dimensione font di base in pt (7-16, default 10).';
COMMENT ON COLUMN public.quote_templates.heading_size_scale IS 'Moltiplicatore per i titoli (default 1.60).';
COMMENT ON COLUMN public.quote_templates.line_height IS 'Altezza riga (1.00-2.50).';
COMMENT ON COLUMN public.quote_templates.row_density IS 'Densità righe tabella: compact | normal | comfortable.';
COMMENT ON COLUMN public.quote_templates.table_zebra IS 'Righe alternate in tabella.';
COMMENT ON COLUMN public.quote_templates.table_borders IS 'Stile bordi tabella: none | horizontal | all.';
COMMENT ON COLUMN public.quote_templates.header_alignment IS 'Allineamento header: left | center | right.';
COMMENT ON COLUMN public.quote_templates.page_margin_mm IS 'Margini pagina in mm (8-30).';

COMMIT;
