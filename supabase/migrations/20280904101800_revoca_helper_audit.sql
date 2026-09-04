-- Correzione di igiene su due funzioni introdotte in questa stessa serie.
--
-- `audit_request_header` e `tg_company_status_event` sono state create senza
-- revocare l'esecuzione al ruolo anonimo, che in PostgreSQL è concessa per
-- impostazione predefinita. Sono quindi finite fra le funzioni SECURITY
-- DEFINER esposte ad `anon` — esattamente la categoria che l'intervento F0-07
-- stava riducendo.
--
-- Il rischio concreto è basso: `audit_request_header` legge soltanto gli header
-- della richiesta in corso di chi la chiama, non dati altrui, e
-- `tg_company_status_event` è una funzione di trigger che fuori dal proprio
-- trigger fallisce comunque. Ma nessuna delle due serve al pubblico, e lasciarle
-- aperte contraddice il lavoro fatto poche migrazioni prima.

REVOKE ALL ON FUNCTION public.audit_request_header(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_request_header(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tg_company_status_event() FROM PUBLIC, anon;

-- Stessa verifica sulla funzione di audit principale, per non lasciare aperta
-- l'unica porta di una serie che le sta chiudendo.
REVOKE ALL ON FUNCTION public.tg_audit_log_row() FROM PUBLIC, anon;
