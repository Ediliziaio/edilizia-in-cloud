-- Aggiunge a sr_template_pdf un campo per il "percorso cliente" personalizzabile:
-- fasi + step che vengono mostrati nel PDF come pagina dedicata "Il tuo percorso".
--
-- Struttura JSONB:
-- {
--   attivo: boolean,
--   titolo: string,
--   sottotitolo: string,
--   fasi: [
--     { nome: "Consulenza", icona: "phone", step: ["Chiamata conoscitiva",
--       "Primo appuntamento", "Comprensione esigenze"] },
--     { nome: "Proposta", icona: "file", step: [...] },
--     ...
--   ]
-- }
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS percorso_cliente JSONB;

COMMENT ON COLUMN public.sr_template_pdf.percorso_cliente IS
  'Pagina "Il tuo percorso" del PDF preventivo: fasi + step editabili '
  'dall''admin. Struttura: { attivo, titolo, sottotitolo, fasi: [{ nome, '
  'icona, step: string[] }] }. NULL = pagina non inclusa.';

NOTIFY pgrst, 'reload schema';
