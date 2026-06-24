-- Bagni cover parity — porta su bgn_template_pdf il sistema di "cover PDF con
-- preset 1-click" già presente in sr_template_pdf (layout completo: posizione
-- verticale testo, dimensioni font eyebrow/titolo/sottotitolo, stile overlay,
-- decorazione SVG, colore testo, allineamento, posizione logo, immagine di
-- sfondo, card cliente).
--
-- bgn_template_pdf oggi ha solo i campi cover "legacy" (cover_title,
-- cover_subtitle, cover_image_url, cover_logo_position, cover_text_color,
-- cover_overlay_opacity, cover_title_size, cover_text_align) e NESSUNA colonna
-- pdf_cover_*. Qui aggiungiamo le colonne pdf_cover_* allineate 1:1 a
-- sr_template_pdf, con gli stessi tipi/default (text/integer/boolean nullable;
-- decoration_style/text_vertical/overlay_style/logo_position NOT NULL DEFAULT).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS su ogni colonna → applicabile più volte.
ALTER TABLE public.bgn_template_pdf
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
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_size        integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical    text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style    text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position    text NOT NULL DEFAULT 'top_left';

COMMENT ON COLUMN public.bgn_template_pdf.pdf_cover_overlay_style IS
  'Stile overlay sopra immagine cover: flat | gradient | gradient_diag | vignette.';
COMMENT ON COLUMN public.bgn_template_pdf.pdf_cover_decoration_style IS
  'Variante decorazione SVG cover: square | circle | line | pattern | none.';
COMMENT ON COLUMN public.bgn_template_pdf.pdf_cover_text_vertical IS
  'Allineamento verticale blocco testo cover: top | center | bottom.';
COMMENT ON COLUMN public.bgn_template_pdf.pdf_cover_logo_position IS
  'Posizione logo cover: top_left | top_center | top_right | hidden.';
