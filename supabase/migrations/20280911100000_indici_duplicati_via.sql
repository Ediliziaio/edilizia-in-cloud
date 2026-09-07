-- Tre coppie di indici identici, segnalate dal linter. Un indice doppio costa
-- il doppio a ogni scrittura e non restituisce niente in lettura: il planner ne
-- usa uno solo.
--
-- Il primo è mio: attribution_pageviews_sessione_idx, creato il 6 settembre
-- senza guardare se esistesse già idx_attribution_pageviews_sessione. Esisteva.
-- Si tiene in ogni coppia il nome più vecchio, così nessun riferimento nei
-- commenti o nelle note di chi li ha creati resta orfano.

SET LOCAL lock_timeout = '3s';

DROP INDEX IF EXISTS public.attribution_pageviews_sessione_idx;
DROP INDEX IF EXISTS public.openwa_messages_norm_tel_out_idx;
DROP INDEX IF EXISTS public.idx_order_external_teams_order_id;
