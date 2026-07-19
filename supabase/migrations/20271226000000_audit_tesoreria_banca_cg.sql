-- ============================================================================
-- AUDIT Tesoreria / Banca (Open Banking) / Controllo di Gestione
-- Applicato LIVE via execute_sql (NON db push — vedi backlog migration).
-- Questo file è la SOURCE OF TRUTH delle modifiche DB.
-- ============================================================================

-- ── P0 SICUREZZA — mark_scadenza_paid: cross-tenant write ────────────────────
-- Era SECURITY DEFINER concessa ad anon+PUBLIC senza assert_company_access:
-- chiunque poteva marcare pagata una scadenza altrui creando prima nota nella
-- cassa di un'altra azienda. Aggiunto assert + revoca anon/PUBLIC.
-- (Corpo funzione completo applicato live; qui la parte critica.)
-- ALTER: dopo "SELECT * INTO v_scadenza ... IF NOT FOUND ..." aggiunto:
--   PERFORM public.assert_company_access(v_scadenza.company_id);
REVOKE EXECUTE ON FUNCTION public.mark_scadenza_paid(uuid, numeric, text, date, text, text) FROM anon, PUBLIC;

-- ── P0 SICUREZZA — Controllo di Gestione: leak senza login ───────────────────
-- Le cg_* (SECURITY DEFINER) avevano grant ad anon/PUBLIC e un guard NULL-unsafe
-- (v_company_id <> get_my_company_id() = NULL quando anon → IF non scatta →
-- fail-open): bilanci/rating di QUALSIASI azienda leggibili senza autenticazione.
-- Revoca anon/PUBLIC su tutte le cg_*; authenticated mantiene l'accesso (guard OK
-- perché get_my_company_id() non è NULL) e service_role per edge/cron.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT proname, pg_get_function_identity_arguments(oid) AS args
           FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'cg\_%' AND prokind='f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
  END LOOP;
END $$;

-- ── P1 CORRETTEZZA — silvio_cashflow_forecast_90d: "Saldo oggi" sempre €0 ─────
-- La query saldo referenziava bank_accounts.is_archived (colonna inesistente):
-- errore 42703 ingoiato da WHEN OTHERS → v_balance_today=0 → forecast e banner
-- "cassa critica" spurii. Cambiato is_archived → is_active (corpo completo live).
--   WHERE company_id = p_company_id AND COALESCE(is_active, true) = true;

-- ── P2 CORRETTEZZA — get_scadenzario_summary: "Scadute" escludeva le parziali ─
-- I due aggregati scadute_* usavano status='da_pagare'; una scadenza 'parziale'
-- scaduta era rossa in tabella + overdue nei test ma non contata nel KPI.
-- Cambiato in status IN ('da_pagare','parziale') (corpo completo live).

-- ── P1 CORRETTEZZA — bank_transactions.amount_eur mai popolato (118/118 NULL) ─
-- mapTx non scriveva amount_eur e non esisteva trigger → il rilevatore pagamenti
-- doppi (silvio_tool_detect_duplicate_payments, WHERE amount_eur IS NOT NULL)
-- vedeva zero movimenti. Trigger + backfill.
CREATE OR REPLACE FUNCTION public.bank_transactions_set_amount_eur()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.amount_eur IS NULL AND COALESCE(NEW.currency,'EUR') = 'EUR' THEN
    NEW.amount_eur := NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bank_tx_amount_eur ON public.bank_transactions;
CREATE TRIGGER trg_bank_tx_amount_eur
  BEFORE INSERT OR UPDATE OF amount, currency, amount_eur ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_transactions_set_amount_eur();
UPDATE public.bank_transactions SET amount_eur = amount
 WHERE COALESCE(currency,'EUR') = 'EUR' AND amount_eur IS NULL;

-- ── P2 CORRETTEZZA — anti doppio-pagamento in riconciliazione ────────────────
-- bank_reconciliations non aveva vincoli oltre la PK: due run concorrenti di
-- bank-auto-reconcile potevano creare due pagamenti per la stessa transazione.
-- Unique parziale: una sola riconciliazione ATTIVA per transazione.
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliations_active_tx_uidx
  ON public.bank_reconciliations (transaction_id)
  WHERE unmatched_at IS NULL;
