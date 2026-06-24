-- ════════════════════════════════════════════════════════════════════════════
-- Climatizzazione cover parity — allinea clm_template_pdf a sr_template_pdf per i
-- preset cover 1-click (layout completo: bg color, immagine, posizione verticale
-- testo, dimensioni font, stile overlay, decorazione SVG, eyebrow/sottotitolo,
-- card cliente, posizione/scala logo).
-- ────────────────────────────────────────────────────────────────────────────
-- Oggi clm_template_pdf ha SOLO i campi cover "base" (cover_title, cover_subtitle,
-- cover_image_url, cover_text_color, cover_logo_position, cover_overlay_opacity,
-- cover_title_size, cover_text_align). Aggiungiamo le colonne `pdf_cover_*`
-- mancanti per portare la stessa esperienza di Serramenti, con gli STESSI
-- tipi/default di sr_template_pdf:
--   • pdf_cover_decoration_style  text NOT NULL DEFAULT 'square'  (square|circle|line|pattern|none)
--   • pdf_cover_show_decoration   boolean   (master-toggle, default true lato app)
--   • pdf_cover_text_vertical     text NOT NULL DEFAULT 'bottom'  (top|center|bottom)
--   • pdf_cover_overlay_style     text NOT NULL DEFAULT 'flat'    (flat|gradient|gradient_diag|vignette)
--   • pdf_cover_bg_color          text      (colore sfondo cover quando non c'è immagine)
--   • pdf_cover_image_url         text      (immagine sfondo cover — parity con cover_image_url)
--   • pdf_cover_overlay_opacity   integer   (0–100, NB: cover_overlay_opacity legacy è 0–1)
--   • pdf_cover_text_color        text      (override colore testo cover)
--   • pdf_cover_text_align        text      (left|center)
--   • pdf_cover_logo_position     text NOT NULL DEFAULT 'top_left' (top_left|top_center|top_right|hidden)
--   • pdf_cover_logo_size         integer   (scala % logo cover, range 60–160; NULL = 100%)
--   • pdf_cover_eyebrow           text      (occhiello sopra il titolo)
--   • pdf_cover_hero              text      (titolo hero, parity con cover_title)
--   • pdf_cover_subhero           text      (sottotitolo, parity con cover_subtitle)
--   • pdf_cover_eyebrow_size      integer   (pt occhiello)
--   • pdf_cover_title_size        integer   (pt titolo)
--   • pdf_cover_subtitle_size     integer   (pt sottotitolo)
--   • pdf_cover_show_client_card  boolean   (card "Preparato per", default true lato app)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Le colonne NOT NULL hanno un DEFAULT
-- così l'ALTER è sicuro anche su righe esistenti. I CHECK replicano i vincoli di
-- sr_template_pdf (aggiunti separatamente con guardia per restare idempotenti).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clm_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_decoration_style text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS pdf_cover_show_decoration  boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical    text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style    text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position    text NOT NULL DEFAULT 'top_left',
  ADD COLUMN IF NOT EXISTS pdf_cover_bg_color         text,
  ADD COLUMN IF NOT EXISTS pdf_cover_image_url        text,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_opacity  integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_color       text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_align       text,
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_size        integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_hero             text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero          text,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_size     integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_title_size       integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_size    integer,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card boolean;

-- CHECK constraints (idempotenti via guardia su pg_constraint) — stessi domini di
-- sr_template_pdf. Se la colonna ha già un valore fuori dominio l'ADD fallirebbe,
-- ma i DEFAULT garantiscono valori validi sulle righe esistenti.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clm_template_pdf_cover_decoration_style_chk') THEN
    ALTER TABLE public.clm_template_pdf
      ADD CONSTRAINT clm_template_pdf_cover_decoration_style_chk
      CHECK (pdf_cover_decoration_style IN ('square', 'circle', 'line', 'pattern', 'none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clm_template_pdf_cover_text_vertical_chk') THEN
    ALTER TABLE public.clm_template_pdf
      ADD CONSTRAINT clm_template_pdf_cover_text_vertical_chk
      CHECK (pdf_cover_text_vertical IN ('top', 'center', 'bottom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clm_template_pdf_cover_overlay_style_chk') THEN
    ALTER TABLE public.clm_template_pdf
      ADD CONSTRAINT clm_template_pdf_cover_overlay_style_chk
      CHECK (pdf_cover_overlay_style IN ('flat', 'gradient', 'gradient_diag', 'vignette'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clm_template_pdf_cover_logo_position_chk') THEN
    ALTER TABLE public.clm_template_pdf
      ADD CONSTRAINT clm_template_pdf_cover_logo_position_chk
      CHECK (pdf_cover_logo_position IN ('top_left', 'top_right', 'top_center', 'hidden'));
  END IF;
END $$;

COMMENT ON COLUMN public.clm_template_pdf.pdf_cover_decoration_style IS
  'Variante decorazione cover top-right: square (default) | circle | line | pattern | none. Ignorato se pdf_cover_show_decoration=false.';
COMMENT ON COLUMN public.clm_template_pdf.pdf_cover_text_vertical IS
  'Allineamento verticale del blocco testo nella cover: bottom (default) | center | top.';
COMMENT ON COLUMN public.clm_template_pdf.pdf_cover_overlay_style IS
  'Stile overlay sopra l''immagine cover: flat (default) | gradient | gradient_diag | vignette. Intensità da pdf_cover_overlay_opacity.';
COMMENT ON COLUMN public.clm_template_pdf.pdf_cover_logo_position IS
  'Posizione del logo nella cover PDF: top_left (default) | top_right | top_center | hidden.';
COMMENT ON COLUMN public.clm_template_pdf.pdf_cover_overlay_opacity IS
  'Opacità overlay scuro sull''immagine cover, scala 0–100 (NB: la legacy cover_overlay_opacity è 0–1).';
COMMENT ON COLUMN public.clm_template_pdf.pdf_cover_logo_size IS
  'Dimensione (scala %) del logo in copertina. NULL = 100%. Range UI 60–160.';

NOTIFY pgrst, 'reload schema';
