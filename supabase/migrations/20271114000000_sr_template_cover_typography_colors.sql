-- Aggiungi colori individuali per i 3 elementi tipografici della copertina PDF
-- (Eyebrow, Titolo hero, Sottotitolo). NULL = usa il colore di default
-- (brand primary per eyebrow, pdf_cover_text_color per titolo, #D1D5DB per sottotitolo).
ALTER TABLE sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_color text,
  ADD COLUMN IF NOT EXISTS pdf_cover_title_color   text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_color text;
