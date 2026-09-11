-- Lotto 01 di 31 — la regola «utente bloccato» calcolata una volta per
-- query invece che una per riga: 25 tabelle, da `_backup_scadenze_orfane_20260827` a `ai_agents_v2`.
--
-- La policy RESTRICTIVE `blocco_utente_bloccato` (20280911100017) era scritta
-- `NOT utente_bloccato()`: una funzione SECURITY DEFINER con un proprio
-- search_path, che il pianificatore non puo' espandere dentro la query e che
-- quindi chiama per OGNI RIGA letta — anche per le righe delle altre aziende,
-- perche' nel filtro viene prima delle regole che le scartano. Misurato su
-- marketing_contact_activities come admin di BeMade: 126.786 chiamate per
-- contare 19.075 righe, 1,9 secondi; un operatore del call center impiegava
-- 2 secondi per vederne zero.
--
-- Tra parentesi con SELECT diventa un InitPlan: una chiamata per query.
-- Stesso significato (se l'utente e' bloccato non vede e non scrive niente) e
-- stessa policy: ALTER POLICY cambia solo le due espressioni, e comando (FOR
-- ALL), ruolo (authenticated) e tipo (RESTRICTIVE) restano quelli di prima.
--
-- Le 7 tabelle della pagina Opportunita' sono in 20280914000013, le tabelle
-- nuove nascono gia' cosi' (20280914100000). Le altre 758 sono qui, 25 per
-- migrazione: ALTER POLICY prende un ACCESS EXCLUSIVE sulla tabella, e
-- centinaia insieme mentre l'app lavora avevano gia' prodotto un deadlock
-- (20280911100017). Con il lock_timeout, un lotto che trova una tabella
-- occupata fallisce tutto intero e si rifa' piu' piccolo.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Un solo blocco DO: il lotto e' una sola istruzione, quindi tutto o niente,
-- e il lock_timeout vale anche se chi lo applica non apre una transazione.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  ALTER POLICY blocco_utente_bloccato ON public._backup_scadenze_orfane_20260827
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.accountant_audit_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.accountant_change_requests
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.accountant_company_access
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.accountant_company_requests
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.action_proposals_audit_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.active_company_selection
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ad_audit_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ad_automation_rules
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ad_media
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ad_spend_guard
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.adempimenti_fiscali
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.adempimenti_sicurezza
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.admin_credit_adjustments
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.aedix_service_clients
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_action_proposals
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_audit_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_branches
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_conversations
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_credits
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_knowledge_docs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_phone_numbers
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agent_tests
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agents
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ai_agents_v2
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
END $$;
