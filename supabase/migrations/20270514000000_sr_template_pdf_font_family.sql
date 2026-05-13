-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 1: Typography refresh — pdf_font_family selector
-- ────────────────────────────────────────────────────────────────────────────
-- Aggiunge selettore font al template PDF. Tre opzioni safe:
--   • 'helvetica' (default): built-in react-pdf, zero rete, zero failure
--   • 'inter'   : self-hosted in /public/fonts/, fallback automatico
--   • 'roboto'  : self-hosted in /public/fonts/, fallback automatico
--
-- Il rendering PDF prova a registrare il font scelto; se fallisce (network,
-- file mancante, parsing error) cade silente su Helvetica.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_font_family TEXT
    DEFAULT 'helvetica'
    CHECK (pdf_font_family IN ('helvetica', 'inter', 'roboto'));

UPDATE public.sr_template_pdf
SET pdf_font_family = 'helvetica'
WHERE pdf_font_family IS NULL;

ALTER TABLE public.sr_template_pdf
  ALTER COLUMN pdf_font_family SET NOT NULL;

COMMENT ON COLUMN public.sr_template_pdf.pdf_font_family IS
  'Font family per il PDF preventivo. helvetica (default, safe) | inter | roboto. '
  'Il render fallback a helvetica se il font scelto non è disponibile.';

NOTIFY pgrst, 'reload schema';
