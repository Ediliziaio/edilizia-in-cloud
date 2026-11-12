-- ============================================================================
-- Via bolla_carica_magazzino (12/11/2026)
-- ----------------------------------------------------------------------------
-- Il carico in magazzino dalla bolla passa da ddt_conferma_consegna, che scrive
-- anche ddt_consegne e, dal 20290313200000, la data del carico sulla bolla.
-- bolla_carica_magazzino la chiamava solo DDTCaricoMagazzinoCard, che non era
-- montata da nessuna parte (tolta nello stesso commit) e non scriveva
-- ddt_consegne: una seconda strada per caricare la stessa merce.
-- Verificato il 12/11/2026: nessun'altra funzione, vista o job cron la nomina,
-- nessuna edge function, non è in funzioni_pubbliche_di_proposito.
-- Restano la colonna ddt_righe.movimento_id e la guardia
-- ddt_riga_caricata_guardia: proteggono le righe caricate con quella strada.
-- ============================================================================

set local lock_timeout = '3s';
drop function if exists public.bolla_carica_magazzino(uuid, jsonb);
