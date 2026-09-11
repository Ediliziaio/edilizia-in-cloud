-- Lotto 07 di 31 — la regola «utente bloccato» calcolata una volta per
-- query invece che una per riga: 25 tabelle, da `cg_riconciliazione_commercialista` a `company_credit_pool`.
-- Il perche' e' in testa al lotto 01 (20280914100001).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Un solo blocco DO: il lotto e' una sola istruzione, quindi tutto o niente,
-- e il lock_timeout vale anche se chi lo applica non apre una transazione.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  ALTER POLICY blocco_utente_bloccato ON public.cg_riconciliazione_commercialista
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.chat_notifications
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.checklist_sicurezza
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.client_margin_history
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.cliente_avvisi
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.clm_computo_voci
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.clm_listino_capitoli
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.clm_listino_voci
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.clm_progetti
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.clm_progetti_media
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.clm_template_pdf
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.commercial_proposals
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.commercial_visit_debriefs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.commission_rules
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_activity_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_activity_summary
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_addons_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_ai_usage
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_auto_topup
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_billing_details
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_billing_overrides
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_branding
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_calendar_links
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_costs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.company_credit_pool
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
END $$;
