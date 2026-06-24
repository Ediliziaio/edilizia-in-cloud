-- FV cover parity — allinea fv_template_pdf a sr_template_pdf per i preset cover
-- 1-click (layout completo: posizione verticale testo, dimensioni font, stile
-- overlay, decorazione). Aggiunge le 7 colonne cover mancanti, con gli stessi
-- tipi/default di sr_template_pdf. Idempotente.
ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical    text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style    text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_title_size       integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size    integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size     integer;
