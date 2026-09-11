-- Lotto 29 di 31 — la regola «utente bloccato» calcolata una volta per
-- query invece che una per riga: 25 tabelle, da `teams` a `user_sessions`.
-- Il perche' e' in testa al lotto 01 (20280914100001).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Un solo blocco DO: il lotto e' una sola istruzione, quindi tutto o niente,
-- e il lock_timeout vale anche se chi lo applica non apre una transazione.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  ALTER POLICY blocco_utente_bloccato ON public.teams
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tecnico_gps_consent
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.telegram_bot_configs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.telegram_user_mappings
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.telnyx_webrtc_credentials
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tet_computo_voci
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tet_listino_capitoli
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tet_listino_voci
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tet_progetti
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tet_progetti_media
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tet_template_pdf
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tickets
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tipi_documento_operaio
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tipi_impianto
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tipi_intervento
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.tool_execution_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.topup_outbox
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.treasury_categories
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.ufficio_membri
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.user_audit_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.user_availability
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.user_calendar_preferences
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.user_messaging_channels
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.user_notification_preferences
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.user_sessions
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
END $$;
