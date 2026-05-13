-- ════════════════════════════════════════════════════════════════════════════
-- M13 · Cover overlay style — tipo overlay configurabile (oltre il nero piatto)
-- ────────────────────────────────────────────────────────────────────────────
-- Fino ad oggi l'overlay sopra l'immagine cover era SOLO nero piatto con
-- opacity variabile. Aggiungiamo `pdf_cover_overlay_style` per scegliere:
--   • 'flat'      → nero piatto (default, retrocompat)
--   • 'gradient'  → gradient verticale: trasparente in alto → scuro in basso
--   • 'gradient_diag' → gradient diagonale top-left → bottom-right
--   • 'vignette'  → angoli scuri, centro chiaro (mette in risalto il testo)
--
-- Il livello di scurezza resta controllato da pdf_cover_overlay_opacity.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_style TEXT
    DEFAULT 'flat' NOT NULL
    CHECK (pdf_cover_overlay_style IN ('flat', 'gradient', 'gradient_diag', 'vignette'));

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_overlay_style IS
  'Stile overlay sopra l''immagine cover: flat (default) | gradient (trasparente '
  'in alto, scuro in basso) | gradient_diag (diagonale) | vignette (angoli scuri). '
  'L''intensità è controllata da pdf_cover_overlay_opacity.';

NOTIFY pgrst, 'reload schema';
