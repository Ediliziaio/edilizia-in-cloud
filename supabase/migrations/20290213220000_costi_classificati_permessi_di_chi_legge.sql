-- La vista dei costi del Controllo di Gestione torna a leggere con i permessi di chi chiede (10/11/2026).
--
-- `CREATE OR REPLACE VIEW` senza `WITH (security_invoker = on)` toglie l'impostazione: la vista
-- torna a girare coi permessi del proprietario e scavalca le regole per azienda. Dal 09/11
-- (20290116120000, poi 20290116140000 e 20290212130000) `v_cg_costi_classificati` era leggibile
-- da ogni utente collegato con i costi e i movimenti bancari di TUTTE le aziende: provato con un
-- cliente esterno, 3.119 righe di 10 aziende. Le pagine passano dalle funzioni del Controllo di
-- Gestione, che filtrano da sole, e non cambiano.
--
-- La stessa correzione è arrivata in parallelo da un'altra sessione (20290213090000): questa
-- è applicata dopo, non cambia niente, e resta perché il registro delle migrazioni la contiene.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter view public.v_cg_costi_classificati set (security_invoker = on);
