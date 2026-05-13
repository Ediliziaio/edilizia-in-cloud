-- ════════════════════════════════════════════════════════════════════════════
-- M19 · Decoration cover variants — 5 stili invece dell'unico quadrato accent
-- ────────────────────────────────────────────────────────────────────────────
-- Oggi pdf_cover_show_decoration è un boolean: o quadrato accent top-right
-- oppure nulla. Aggiungiamo `pdf_cover_decoration_style` per scegliere:
--   • 'square'      → quadrato pieno (default, retrocompat dell'attuale stile)
--   • 'circle'      → cerchio outline accent
--   • 'line'        → linea verticale sottile
--   • 'pattern'     → pattern geometrico (dots/grid)
--   • 'none'        → nessuna (equivalente a pdf_cover_show_decoration=false)
--
-- pdf_cover_show_decoration resta come master-toggle. Se è false, il valore
-- di pdf_cover_decoration_style viene ignorato.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style TEXT
    DEFAULT 'square' NOT NULL
    CHECK (pdf_cover_decoration_style IN ('square', 'circle', 'line', 'pattern', 'none'));

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_decoration_style IS
  'Variante decorazione cover top-right: square (default) | circle (cerchio '
  'outline) | line (linea verticale) | pattern (dots/grid) | none. Ignorato '
  'se pdf_cover_show_decoration=false.';

NOTIFY pgrst, 'reload schema';
