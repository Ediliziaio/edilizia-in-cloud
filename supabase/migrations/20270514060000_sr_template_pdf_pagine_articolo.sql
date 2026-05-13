-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 9: Pagine foto-tecniche dedicate per articolo
-- ────────────────────────────────────────────────────────────────────────────
-- Quando attivo, per ogni gruppo serramento con almeno una foto di
-- sopralluogo o render AI legata via `sr_progetti_media.serramento_id`,
-- il PDF aggiunge una pagina A4 dedicata con:
--   • Foto reali del cantiere (situazione + render appaiati)
--   • Scheda tecnica completa (tipologia, materiale, vetro, dimensioni,
--     colori, ambiente, valori_assi, quantità)
--   • Note libere della riga BOM
--
-- Use case: cliente residenziale che vuole vedere "la sua finestra" sul
-- preventivo, non solo la scheda generica del catalogo. Off di default
-- perché aumenta significativamente il numero di pagine.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_pagine_articolo_dedicate BOOLEAN
    DEFAULT false NOT NULL;

COMMENT ON COLUMN public.sr_template_pdf.pdf_pagine_articolo_dedicate IS
  'Aggiunge una pagina A4 dedicata per ogni gruppo serramento che ha '
  'almeno una foto sopralluogo o render AI legata via serramento_id. '
  'Off di default — aumenta il numero di pagine, utile per consegne '
  'foto-tecniche dettagliate al cliente.';

NOTIFY pgrst, 'reload schema';
