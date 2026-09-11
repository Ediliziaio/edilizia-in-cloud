-- Lotto 26 di 31 — la regola «utente bloccato» calcolata una volta per
-- query invece che una per riga: 25 tabelle, da `silvio_morning_briefings` a `social_accounts`.
-- Il perche' e' in testa al lotto 01 (20280914100001).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Un solo blocco DO: il lotto e' una sola istruzione, quindi tutto o niente,
-- e il lock_timeout vale anche se chi lo applica non apre una transazione.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  ALTER POLICY blocco_utente_bloccato ON public.silvio_morning_briefings
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_outbound_messages
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_playbook
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_reminders
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_task
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_tool_steps
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_trigger_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.silvio_user_preferences
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.simulazioni
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.site_deliveries
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_automation_logs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_automations
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_campaigns
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_contacts
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_logs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_messages
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_provider_config
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_telnyx_accounts
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_telnyx_numbers
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_templates
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_wallet
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sms_wallet_transazioni
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.social_account_tokens
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.social_accounts
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
END $$;
