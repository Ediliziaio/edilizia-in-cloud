-- Termoidraulico cover parity — allinea idr_template_pdf a sr_template_pdf per i
-- preset cover 1-click (layout completo: immagine + overlay style, posizione
-- verticale testo, dimensioni font, decorazione SVG, posizione/size logo, card
-- cliente). Oggi idr_template_pdf NON ha nessuna colonna pdf_cover_* (usa lo
-- schema legacy cover_*): qui aggiungiamo l'INTERO set pdf_cover_* presente in
-- sr_template_pdf, con gli stessi tipi/null/default. Idempotente.
--
-- Tipi allineati a sr_template_pdf (verificati su information_schema):
--   - text NOT NULL DEFAULT: decoration_style/logo_position/overlay_style/text_vertical
--   - text nullable        : bg_color/eyebrow/hero/image_url/subhero/subhero_template/
--                             text_align/text_color
--   - smallint nullable     : eyebrow_size/overlay_opacity/subtitle_size/title_size
--   - integer nullable      : logo_size
--   - boolean nullable      : show_client_card/show_decoration
ALTER TABLE public.idr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_bg_color          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style  text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow           text,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size      smallint,
  ADD COLUMN IF NOT EXISTS pdf_cover_hero              text,
  ADD COLUMN IF NOT EXISTS pdf_cover_image_url         text,
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position     text NOT NULL DEFAULT 'top_left',
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_size         integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_opacity   smallint,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style     text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration   boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero           text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero_template  text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size     smallint,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_align        text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_color        text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical     text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_title_size        smallint;
