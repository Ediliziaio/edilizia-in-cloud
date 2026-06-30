-- Tetti cover parity — porta la copertina di tet_template_pdf alla parità con
-- sr_template_pdf per i preset cover 1-click (layout completo: colore di sfondo,
-- eyebrow, posizione verticale testo, dimensioni font, stile overlay, decorazione,
-- card cliente, dimensione logo).
--
-- Il modulo tetti usa lo schema `cover_*` (NON `pdf_cover_*` come Serramenti/FV):
-- la sua tabella, il tipo `TetTemplatePdf` e il renderer `TettiPDF` leggono già
-- `cover_title`, `cover_image_url`, `cover_text_color`, ecc. Qui aggiungiamo le
-- colonne `cover_*` mancanti che mappano 1:1 le `pdf_cover_*` di Serramenti.
--
-- Tipi/semantica allineati a sr_template_pdf:
--   pdf_cover_overlay_style    text   → cover_overlay_style    (flat|gradient|gradient_diag|vignette)
--   pdf_cover_text_vertical    text   → cover_text_vertical    (top|center|bottom)
--   pdf_cover_decoration_style text   → cover_decoration_style (square|circle|line|pattern|none)
--   pdf_cover_show_decoration  bool   → cover_show_decoration
--   pdf_cover_show_client_card bool   → cover_show_client_card
--   pdf_cover_bg_color         text   → cover_bg_color         (nullable: null = usa coverBg default)
--   pdf_cover_eyebrow          text   → cover_eyebrow          (nullable)
--   pdf_cover_eyebrow_size     int    → cover_eyebrow_size     (nullable)
--   pdf_cover_subtitle_size    int    → cover_subtitle_size    (nullable)
--   pdf_cover_logo_size        int    → cover_logo_size        (nullable, scala % 60-160)
--
-- NB: le colonne cover_* preesistenti di tetti sono tutte NULLABLE; manteniamo lo
-- stesso stile (DEFAULT senza NOT NULL) perché l'upsert del template è generico
-- (spread di tutti i campi del form) e potrebbe inviare NULL: un vincolo NOT NULL
-- romperebbe il salvataggio su righe già esistenti. Il renderer e l'editor
-- applicano comunque i default in modo difensivo. Idempotente.
ALTER TABLE public.tet_template_pdf
  ADD COLUMN IF NOT EXISTS cover_overlay_style    text DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS cover_text_vertical    text DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS cover_decoration_style text DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS cover_show_decoration  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cover_show_client_card boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cover_bg_color         text,
  ADD COLUMN IF NOT EXISTS cover_eyebrow          text,
  ADD COLUMN IF NOT EXISTS cover_eyebrow_size     integer,
  ADD COLUMN IF NOT EXISTS cover_subtitle_size    integer,
  ADD COLUMN IF NOT EXISTS cover_logo_size        integer;
