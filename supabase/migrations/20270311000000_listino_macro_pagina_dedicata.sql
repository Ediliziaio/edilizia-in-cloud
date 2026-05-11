-- Aggiunge supporto "pagina dedicata nel PDF preventivo" per macrocategorie.
--
-- Use case: l'azienda vuole che il preventivo serramenti includa una pagina
-- dedicata a ciascuna macrocategoria coinvolta (es. una pagina per "Infissi
-- WND" con foto del prodotto + descrizione estesa). Permette di vendere
-- ogni linea/modello con il proprio "storytelling".
--
-- Campi:
--   - descrizione_estesa: testo lungo (markdown-light) per la pagina PDF.
--     `descrizione` resta come breve, usata in elenchi/picker.
--   - mostra_pagina_dedicata_pdf: flag on/off. Quando true, l'edge function
--     sr-genera-pdf inserisce la pagina dedicata (se la macro è nel BOM).
--
-- Idempotente.

ALTER TABLE public.listino_macrocategorie
  ADD COLUMN IF NOT EXISTS descrizione_estesa TEXT,
  ADD COLUMN IF NOT EXISTS mostra_pagina_dedicata_pdf BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listino_macrocategorie.descrizione_estesa IS
  'Descrizione lunga formattata (markdown-light: paragrafi, bullets). '
  'Usata nella pagina dedicata del PDF preventivo, NULL = usa descrizione breve.';

COMMENT ON COLUMN public.listino_macrocategorie.mostra_pagina_dedicata_pdf IS
  'Se TRUE, sr-genera-pdf inserisce una pagina dedicata per questa '
  'macrocategoria quando è presente nel BOM del preventivo. Layout: foto '
  '+ nome + descrizione_estesa.';

NOTIFY pgrst, 'reload schema';
