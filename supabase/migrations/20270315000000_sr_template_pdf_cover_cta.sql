-- Estende sr_template_pdf con campi per personalizzare:
--  - Frase hero della cover PDF (titolo emotivo che vede il cliente)
--  - Box CTA finale "Cosa fare adesso" (default sensato, override aziendale)
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_hero TEXT,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero TEXT,
  ADD COLUMN IF NOT EXISTS pdf_cta_finale_titolo TEXT,
  ADD COLUMN IF NOT EXISTS pdf_cta_finale_passi TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_hero IS
  'Titolo grande della cover PDF preventivo serramenti. Es. "La tua casa, finalmente al caldo." '
  'Se NULL, fallback testuale generico. L''azienda lo personalizza per brand voice.';

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_subhero IS
  'Sottotitolo della cover (1-2 righe). Se NULL, fallback alla sintesi intervento del progetto.';

COMMENT ON COLUMN public.sr_template_pdf.pdf_cta_finale_titolo IS
  'Titolo del box "Cosa fare adesso" in chiusura PDF. Default: "Cosa fare adesso".';

COMMENT ON COLUMN public.sr_template_pdf.pdf_cta_finale_passi IS
  'Lista di passi azione finale (array TEXT). Default 3 step: conferma consulenza, '
  'firma preventivo, versa acconto. Override possibile per azienda.';

NOTIFY pgrst, 'reload schema';
