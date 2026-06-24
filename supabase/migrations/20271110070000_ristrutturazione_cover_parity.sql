-- Ristrutturazione cover parity — porta su rst_template_pdf il sistema di
-- "cover PDF con preset 1-click" già presente in sr_template_pdf (layout
-- completo: posizione verticale testo, dimensioni font eyebrow/titolo/sottotitolo,
-- stile overlay, decorazione SVG, colore testo, allineamento, posizione logo,
-- immagine di sfondo, card cliente).
--
-- rst_template_pdf oggi ha solo i campi cover "legacy" (cover_title, cover_subtitle,
-- cover_image_url, cover_logo_position, cover_text_color, cover_overlay_opacity,
-- cover_title_size, cover_text_align) e NESSUNA colonna pdf_cover_*. Qui aggiungiamo
-- le colonne pdf_cover_* allineate 1:1 a sr_template_pdf, con gli stessi tipi/default.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS su ogni colonna → applicabile più volte.
ALTER TABLE public.rst_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_bg_color         text,
  ADD COLUMN IF NOT EXISTS pdf_cover_image_url        text,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_hero             text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero_template text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_color       text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_align       text,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_opacity  integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size     integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_title_size       integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size    integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical    text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style    text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position    text NOT NULL DEFAULT 'top_left';
