-- Ulteriore personalizzazione della cover PDF preventivo:
--   - Dimensioni font configurabili (eyebrow / titolo / sottotitolo)
--   - Colore testo override (default bianco)
--   - Toggle decorazione SVG in alto a destra
--   - Toggle card "Preparato per"
--   - Allineamento testo cover (left / center)
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size SMALLINT,
  ADD COLUMN IF NOT EXISTS pdf_cover_title_size SMALLINT,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size SMALLINT,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_color TEXT,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_align TEXT;

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_eyebrow_size IS
  'Dimensione (pt) del testo eyebrow nella cover. Default 11.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_title_size IS
  'Dimensione (pt) del titolo hero nella cover. Default 38.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_subtitle_size IS
  'Dimensione (pt) del sottotitolo nella cover. Default 13.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_text_color IS
  'Colore del testo della cover (override). Default #FFFFFF.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_show_decoration IS
  'Mostra la decorazione SVG (finestra stilizzata) in alto a destra. Default true.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_show_client_card IS
  'Mostra la card "Preparato per" con i dati del cliente. Default true.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_text_align IS
  'Allineamento dei testi cover: left | center. Default left.';

NOTIFY pgrst, 'reload schema';
