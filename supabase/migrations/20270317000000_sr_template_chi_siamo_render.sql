-- Estende sr_template_pdf per personalizzazione completa del PDF preventivo
-- da SettingsQuoteTemplates → Serramenti:
--   - Pagina "Chi siamo" subito dopo la cover (opt-in)
--   - Disclaimer legale render AI custom (default sensato)
--   - Toggle recensioni visibili nel PDF
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS chi_siamo_attivo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chi_siamo_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS chi_siamo_titolo TEXT,
  ADD COLUMN IF NOT EXISTS chi_siamo_testo TEXT,
  ADD COLUMN IF NOT EXISTS recensioni_attivo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS render_disclaimer TEXT;

COMMENT ON COLUMN public.sr_template_pdf.chi_siamo_attivo IS
  'Se TRUE, il PDF include una pagina "Chi siamo" subito dopo la cover.';
COMMENT ON COLUMN public.sr_template_pdf.chi_siamo_foto_url IS
  'URL pubblico foto azienda (sede, showroom, team) per pagina Chi siamo.';
COMMENT ON COLUMN public.sr_template_pdf.chi_siamo_titolo IS
  'Titolo della pagina Chi siamo. Es. "15 anni di artigianato a Milano".';
COMMENT ON COLUMN public.sr_template_pdf.chi_siamo_testo IS
  'Descrizione estesa azienda (paragrafi + bullet con - inizio riga).';
COMMENT ON COLUMN public.sr_template_pdf.recensioni_attivo IS
  'Se TRUE, mostra sezione recensioni/testimonianze nel PDF.';
COMMENT ON COLUMN public.sr_template_pdf.render_disclaimer IS
  'Testo disclaimer mostrato sotto le immagini render AI. NULL = default IT.';

NOTIFY pgrst, 'reload schema';
