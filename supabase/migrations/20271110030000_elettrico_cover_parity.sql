-- Elettrico cover parity — allinea ele_template_pdf a sr_template_pdf per i
-- preset cover 1-click (layout completo: posizione verticale testo, dimensioni
-- font, stile overlay, decorazione, posizione/scala logo, card cliente).
--
-- ele_template_pdf nasce con i campi cover "flat" (cover_title, cover_subtitle,
-- cover_image_url, cover_text_color, cover_logo_position, cover_overlay_opacity,
-- cover_title_size, cover_text_align) e NON aveva nessuna colonna pdf_cover_*.
-- Qui aggiungiamo TUTTE le colonne pdf_cover_* presenti in sr_template_pdf
-- (più pdf_cover_logo_size, usata dall'editor/PDF Serramenti), con gli stessi
-- tipi/default. I vecchi campi cover_* restano invariati per retrocompatibilità.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS su ogni colonna.
ALTER TABLE public.ele_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_bg_color         text,
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size     integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_hero             text,
  ADD COLUMN IF NOT EXISTS pdf_cover_image_url        text,
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position    text NOT NULL DEFAULT 'top_left',
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_size        integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_opacity  integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style    text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero_template text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size    integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_align       text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_color       text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical    text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_title_size       integer;
