-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 2: Versioning footer toggle
-- ────────────────────────────────────────────────────────────────────────────
-- Toggle per mostrare/nascondere il footer di versione su ogni pagina PDF.
-- Default ON: "Preventivo SR-001 · v2 · pagina 3/8 · 13/05/2026"
-- Permette al cliente di distinguere tra revisioni multiple di uno stesso
-- preventivo (parent_id ≠ NULL → revision_number > 1).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_show_revision_footer BOOLEAN
    DEFAULT true NOT NULL;

COMMENT ON COLUMN public.sr_template_pdf.pdf_show_revision_footer IS
  'Mostra footer "Preventivo {code} · v{revision_number} · pagina X/N · data" '
  'su ogni pagina del PDF. Utile per identificare la versione del preventivo '
  'quando esistono più revisioni (sr_progetti.parent_id, migration 250000).';

NOTIFY pgrst, 'reload schema';
