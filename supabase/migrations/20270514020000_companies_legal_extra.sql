-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 3: White-label totale — campi legali extra per footer PDF
-- ────────────────────────────────────────────────────────────────────────────
-- companies ha già `pec` e `capitale_sociale`. Aggiungiamo `numero_rea`
-- (Repertorio Economico Amministrativo, obbligatorio per fatture B2B).
-- Esposti nel footer PDF se template.pdf_show_legal_footer = true.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS numero_rea TEXT;

-- Toggle template PDF per attivare il footer legale esteso
ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_show_legal_footer BOOLEAN
    DEFAULT false NOT NULL;

COMMENT ON COLUMN public.companies.numero_rea IS
  'Numero REA (Repertorio Economico Amministrativo). Obbligatorio per fatture '
  'B2B in Italia, mostrato nel footer legale del PDF preventivo se attivato.';

COMMENT ON COLUMN public.sr_template_pdf.pdf_show_legal_footer IS
  'Mostra footer legale esteso nel PDF (Capitale Sociale, REA, PEC). '
  'Off di default per non appesantire i preventivi; on per setup B2B.';

NOTIFY pgrst, 'reload schema';
