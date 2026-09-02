-- Modulo Ristrutturazione: mancava un posto per clausole contrattuali e termini
-- legali (Serramenti e Fotovoltaico lo hanno). Stesse colonne degli altri moduli.
-- Applicata a mano il 2026-09-02; idempotente.
ALTER TABLE public.rst_template_pdf
  ADD COLUMN IF NOT EXISTS condizioni_legali_attivo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS condizioni_legali_testo text;
COMMENT ON COLUMN public.rst_template_pdf.condizioni_legali_testo IS
  'Condizioni contrattuali e termini legali stampati come pagina dedicata in coda al PDF ristrutturazione. Testo semplice/markdown, merge dalla libreria Template offerte.';
