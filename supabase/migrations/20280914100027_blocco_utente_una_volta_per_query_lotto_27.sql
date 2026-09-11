-- Lotto 27 di 31 — la regola «utente bloccato» calcolata una volta per
-- query invece che una per riga: 25 tabelle, da `social_inbox_items` a `superadmin_preview_tokens`.
-- Il perche' e' in testa al lotto 01 (20280914100001).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Un solo blocco DO: il lotto e' una sola istruzione, quindi tutto o niente,
-- e il lock_timeout vale anche se chi lo applica non apre una transazione.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  ALTER POLICY blocco_utente_bloccato ON public.social_inbox_items
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.social_media_items
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.social_posts
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.social_publish_jobs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_accessori_progetto
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_calcolo_risparmio
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_cantieri_referenza
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_pdf_generation_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_progetti
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_progetti_audit
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_progetti_media
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_serramenti_progetto
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_servizi_progetto
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.sr_template_pdf
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.staff_permissions
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.stock_lotti
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.stock_units
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.stripe_events_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.subappaltatori
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.subappaltatori_documenti
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.subappaltatori_sicurezza
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.subscription_invoices
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.subscription_logs
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.superadmin_override_log
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
  ALTER POLICY blocco_utente_bloccato ON public.superadmin_preview_tokens
    USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
END $$;
