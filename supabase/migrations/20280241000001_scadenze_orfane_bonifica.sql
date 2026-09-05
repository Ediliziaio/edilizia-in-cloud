-- ============================================================================
-- Bonifica: scadenze che puntano a fatture inesistenti.
--
-- Trovate 123 righe (139.256 €) tutte su un'azienda demo: scadenze generate
-- dalla sincronizzazione fatture (is_auto_generated, auto_source='invoice'),
-- con scadenze dal 2021 al 2026, TUTTE ancora "da_pagare" e scadute. Erano
-- crediti fantasma: gonfiavano lo scadenzario di 139k di insoluti mai esistiti.
--
-- Come sono nate: le fatture importate sono state cancellate a mano
-- bypassando i vincoli (session_replication_role=replica o simile). La FK
-- scadenze_invoice_id_fkey esiste da marzo 2026 ed e' ON DELETE SET NULL:
-- una cancellazione normale avrebbe azzerato il riferimento, non lasciato
-- l'orfano. Nessun codice dell'app cancella fatture (verificato su src e
-- supabase/functions), quindi NON e' un difetto ricorrente: e' il residuo di
-- un intervento manuale, e la FK impedisce di crearne di nuove.
--
-- La riga senza la sua fattura non ha piu' significato: e' un artefatto
-- automatico la cui sorgente non esiste. Prima di rimuoverla la salviamo in
-- una tabella di appoggio, cosi' l'operazione resta reversibile.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._backup_scadenze_orfane_20260827
  (LIKE public.scadenze INCLUDING DEFAULTS);

-- Snapshot: solo le righe non gia' salvate, cosi' la migration e' rieseguibile
INSERT INTO public._backup_scadenze_orfane_20260827
SELECT s.*
FROM public.scadenze s
WHERE s.invoice_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = s.invoice_id)
  AND NOT EXISTS (SELECT 1 FROM public._backup_scadenze_orfane_20260827 b WHERE b.id = s.id);

DELETE FROM public.scadenze s
WHERE s.invoice_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = s.invoice_id);

COMMENT ON TABLE public._backup_scadenze_orfane_20260827 IS
  'Copia delle scadenze orfane rimosse il 2026-08-27 (fatture cancellate a mano fuori dall''app). Eliminabile quando la bonifica e'' considerata definitiva.';
