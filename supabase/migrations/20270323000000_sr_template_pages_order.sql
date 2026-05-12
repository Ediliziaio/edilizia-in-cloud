-- Aggiunge sr_template_pdf.pdf_pages_order: array JSONB che definisce l'ordine
-- e la visibilità delle pagine del PDF preventivo serramenti.
--
-- Formato: [{ id: SrPdfPageId, visible: boolean }, ...]
--
-- IDs supportati (vedi src/types/serramenti.ts SrPdfPageId):
--   chi_siamo, proposta, allegato_tecnico, macro_dedicate,
--   investimento, percorso, render, cta
--
-- La pagina "cover" è sempre la prima e non è riordinabile.
-- NULL = usa l'ordine di default (SR_PDF_PAGES_DEFAULT).
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_pages_order JSONB;

COMMENT ON COLUMN public.sr_template_pdf.pdf_pages_order IS
  'Ordine e visibilità delle pagine PDF preventivo. Array di { id, visible }. '
  'NULL = ordine default. La cover è sempre prima e non riordinabile.';

NOTIFY pgrst, 'reload schema';
