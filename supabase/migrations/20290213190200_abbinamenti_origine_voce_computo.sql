-- ============================================================================
-- Subappalto dal computo, lotto 3: gli abbinamenti voce del computo → voce del
-- listino, ricordati da voci_abbina_listino, hanno la loro origine in
-- product_aliases (learned_from = 'voce_computo'). Il vincolo ammetteva solo
-- manual / capture_review / history / import: con 'manual' si sarebbero
-- mescolati con quelli dei preventivi da foto (ai-quote-from-capture), e la
-- pulizia «l'ultima scelta vince» li avrebbe toccati. La tabella ha 0 righe.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.product_aliases drop constraint if exists product_aliases_learned_from_check;
alter table public.product_aliases add constraint product_aliases_learned_from_check
  check (learned_from = any (array['manual'::text, 'capture_review'::text, 'history'::text, 'import'::text, 'voce_computo'::text]));
