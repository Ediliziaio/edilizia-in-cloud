-- Piscine cover parity — allinea pis_template_pdf a sr_template_pdf per i preset
-- cover 1-click (layout completo: posizione verticale testo, stile overlay,
-- decorazione SVG, card cliente, dimensioni font eyebrow/sottotitolo).
--
-- Il modulo Piscine usa già le colonne cover_* per bg/immagine/colore-testo/
-- opacità-velo/allineamento/dimensione-titolo/posizione-logo. Qui aggiungiamo le
-- colonne pdf_cover_* MANCANTI rispetto a sr_template_pdf, con gli stessi
-- tipi/default di Serramenti. Idempotente (ADD COLUMN IF NOT EXISTS).
ALTER TABLE public.pis_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical    text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style    text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size     integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size    integer;
