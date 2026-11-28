-- Il GRANT di `viaggio` dove la colonna esiste già
-- ───────────────────────────────────────────────
-- 28/11/2026, dal controllo «Complete offline database reconstruction», che rigioca tutte le
-- migrazioni in ordine su un database vuoto.
--
-- `20290629210000_rendiconto_costi_per_colonna` toglie `select` su `appalto_rendiconto_righe` e lo
-- ridà colonna per colonna. Nell'elenco non può stare `viaggio`, che nasce dopo
-- (`20290630100000_rendiconto_modificabile_e_trasporti`): nella ricostruzione da zero la colonna
-- non esiste ancora e la migrazione si ferma. In produzione non si era visto, perché là la colonna
-- c'era già da un giorno.
--
-- Quindi il GRANT sta qui, dopo che la colonna c'è. L'editor del rendiconto la chiede in
-- `COLONNE_RIGHE`: senza, un select con colonne esplicite fallisce e il rendiconto non si apre.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

grant select (viaggio), insert (viaggio), update (viaggio)
  on public.appalto_rendiconto_righe to authenticated;
