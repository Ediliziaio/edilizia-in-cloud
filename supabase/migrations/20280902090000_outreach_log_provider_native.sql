-- Log consegne per le caselle native (gmail/outlook/smtp): il CHECK ammetteva
-- solo i provider API e logEmailDelivery ingoiava l'errore → invii nativi
-- mai loggati. Piu' guardia sulla RPC di prenotazione con cap 0.
ALTER TABLE public.email_delivery_log DROP CONSTRAINT IF EXISTS email_delivery_log_provider_check;
ALTER TABLE public.email_delivery_log ADD CONSTRAINT email_delivery_log_provider_check
  CHECK (provider IS NULL OR provider = ANY (ARRAY['resend','elastic_email','sendgrid','brevo','mailgun','internal','gmail','outlook','smtp']));

CREATE OR REPLACE FUNCTION public.outreach_prenota_invio(p_sender_id uuid, p_today date, p_cap integer)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH u AS (
    UPDATE public.outreach_sender_accounts
    SET daily_sent = CASE WHEN daily_sent_date = p_today THEN daily_sent + 1 ELSE 1 END,
        daily_sent_date = p_today,
        last_sent_at = now(),
        updated_at = now()
    WHERE id = p_sender_id
      AND COALESCE(p_cap, 0) > 0
      AND (daily_sent_date IS DISTINCT FROM p_today OR daily_sent < p_cap)
    RETURNING id)
  SELECT EXISTS (SELECT 1 FROM u);
$f$;
