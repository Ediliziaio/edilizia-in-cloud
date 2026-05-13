-- ════════════════════════════════════════════════════════════════════════════
-- M17 · Posizione logo cover configurabile
-- ────────────────────────────────────────────────────────────────────────────
-- Fino ad oggi il logo nella cover PDF era fisso top-left. Aggiungiamo
-- `pdf_cover_logo_position` per scegliere fra 4 posizioni:
--   • 'top_left'   (default, retrocompat)
--   • 'top_right'
--   • 'top_center'
--   • 'hidden'     → logo nascosto sulla cover (no in altri pagine)
--
-- Utile per layout asymmetric (es. testo allineato a sinistra → logo a
-- destra per bilanciamento visivo) e per cover ultra-minimal senza logo.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position TEXT
    DEFAULT 'top_left' NOT NULL
    CHECK (pdf_cover_logo_position IN ('top_left', 'top_right', 'top_center', 'hidden'));

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_logo_position IS
  'Posizione del logo nella cover PDF: top_left (default) | top_right | '
  'top_center | hidden. Solo cover — header pagine interne resta fisso.';

NOTIFY pgrst, 'reload schema';
