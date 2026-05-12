-- Aggiunge campo consulente_descrizione_default a sr_template_pdf.
-- Mostrato sotto il nome del consulente nella sezione "La tua consulenza"
-- del PDF preventivo per dare un tono più personale e meno asettico.
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS consulente_descrizione_default TEXT;

COMMENT ON COLUMN public.sr_template_pdf.consulente_descrizione_default IS
  'Frase generica mostrata sotto il nome del consulente nel PDF. Tono '
  'personale ("Ti accompagnerò dal sopralluogo al collaudo..."). Se NULL, '
  'fallback al default IT codificato nel componente.';

NOTIFY pgrst, 'reload schema';
