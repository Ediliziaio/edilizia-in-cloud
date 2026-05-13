-- ════════════════════════════════════════════════════════════════════════════
-- M18 · Allineamento verticale blocco testo cover
-- ────────────────────────────────────────────────────────────────────────────
-- Oggi la cover ha layout fisso: logo top + blocco testo (eyebrow/titolo/
-- sottotitolo) in fondo. Aggiungiamo `pdf_cover_text_vertical` per
-- scegliere dove posizionare il blocco testo:
--   • 'bottom' (default, retrocompat — blocco testo in basso)
--   • 'center' (centrato verticalmente)
--   • 'top'    (alto, sotto al logo)
--
-- Utile per cover con foto verticale che mette il "punto focale"
-- in basso → testo va spostato in alto.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_text_vertical TEXT
    DEFAULT 'bottom' NOT NULL
    CHECK (pdf_cover_text_vertical IN ('top', 'center', 'bottom'));

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_text_vertical IS
  'Allineamento verticale del blocco testo nella cover: bottom (default) | '
  'center | top. Indipendente da pdf_cover_text_align (orizzontale).';

NOTIFY pgrst, 'reload schema';
