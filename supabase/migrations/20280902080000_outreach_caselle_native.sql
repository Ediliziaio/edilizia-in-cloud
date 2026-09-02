-- Outreach da caselle "vere" (02/09/2026).
-- Il motore cold spediva solo via Elastic Email o SMTP con password. Qui:
--   1. caselle Gmail/Outlook collegate via OAuth (le stesse di /admin/email)
--      entrano nel pool come mittenti nativi;
--   2. threading dei follow-up (Message-ID salvato sull'invio);
--   3. risposte deduplicate per Message-ID (il poll IMAP le rileggeva ogni 15');
--   4. prenotazione ATOMICA del cap giornaliero (prima read-modify-write);
--   5. sequenze "solo testo"; vista prontezza che capisce le caselle OAuth.

-- 1. provider nativi
ALTER TABLE public.outreach_sender_accounts DROP CONSTRAINT IF EXISTS outreach_sender_accounts_provider_check;
ALTER TABLE public.outreach_sender_accounts ADD CONSTRAINT outreach_sender_accounts_provider_check
  CHECK (provider = ANY (ARRAY['ses','smtp','resend','elastic_email','sendgrid','brevo','mailgun','gmail','outlook']));
ALTER TABLE public.outreach_sender_accounts
  ADD COLUMN IF NOT EXISTS oauth_connection_id uuid REFERENCES public.email_oauth_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS outreach_sender_oauth_idx ON public.outreach_sender_accounts (oauth_connection_id) WHERE oauth_connection_id IS NOT NULL;
COMMENT ON COLUMN public.outreach_sender_accounts.oauth_connection_id IS
  'Per provider gmail/outlook: la connessione OAuth di /admin/email che presta i token. Invio via Gmail API / Microsoft Graph, risposte lette da email_inbox.';

-- 2. threading follow-up
ALTER TABLE public.outreach_send_queue
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS provider_thread_id text;
CREATE INDEX IF NOT EXISTS outreach_queue_enrollment_sent_idx ON public.outreach_send_queue (enrollment_id, sent_at) WHERE status = 'sent';

-- 3. risposte: Message-ID + dedup (backfill dal raw tenendo la prima riga)
ALTER TABLE public.outreach_replies ADD COLUMN IF NOT EXISTS message_id text;
WITH r AS (
  SELECT id, row_number() OVER (PARTITION BY company_id, raw->>'message_id' ORDER BY received_at, id) rn
  FROM public.outreach_replies
  WHERE message_id IS NULL AND COALESCE(raw->>'message_id', '') <> '')
UPDATE public.outreach_replies o SET message_id = o.raw->>'message_id' FROM r WHERE r.id = o.id AND r.rn = 1;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_replies_msgid_uidx ON public.outreach_replies (company_id, message_id) WHERE message_id IS NOT NULL;

-- 4. prenotazione atomica del cap (chiamata PRIMA dell'invio, solo service role)
CREATE OR REPLACE FUNCTION public.outreach_prenota_invio(p_sender_id uuid, p_today date, p_cap integer)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH u AS (
    UPDATE public.outreach_sender_accounts
    SET daily_sent = CASE WHEN daily_sent_date = p_today THEN daily_sent + 1 ELSE 1 END,
        daily_sent_date = p_today,
        last_sent_at = now(),
        updated_at = now()
    WHERE id = p_sender_id
      AND (daily_sent_date IS DISTINCT FROM p_today OR daily_sent < GREATEST(p_cap, 0))
    RETURNING id)
  SELECT EXISTS (SELECT 1 FROM u);
$f$;
CREATE OR REPLACE FUNCTION public.outreach_rilascia_invio(p_sender_id uuid, p_today date)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  UPDATE public.outreach_sender_accounts
  SET daily_sent = GREATEST(0, daily_sent - 1), updated_at = now()
  WHERE id = p_sender_id AND daily_sent_date = p_today;
$f$;
REVOKE ALL ON FUNCTION public.outreach_prenota_invio(uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_rilascia_invio(uuid, date) FROM PUBLIC, anon, authenticated;

-- 5. sequenze solo testo
ALTER TABLE public.outreach_sequences ADD COLUMN IF NOT EXISTS plain_text_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.outreach_sequences.plain_text_only IS
  'Se true le caselle native (gmail/outlook/smtp) spediscono SOLO text/plain, come una mail scritta a mano.';

-- 6. vista prontezza: una casella OAuth non ha IMAP/SMTP propri ma e' pronta
CREATE OR REPLACE VIEW public.v_outreach_infrastruttura WITH (security_invoker = on) AS
 SELECT b.id AS brand_id,
    b.name AS brand,
    b.status AS brand_status,
    b.reply_to IS NOT NULL AS ha_reply_to,
    b.signature IS NOT NULL AS ha_firma,
    b.footer_address IS NOT NULL AS ha_indirizzo,
    d.id AS dominio_id,
    d.domain AS dominio,
    d.status AS dominio_status,
    d.ruolo AS dominio_ruolo,
    d.spf_verified,
    d.dkim_verified,
    d.dmarc_verified,
    d.daily_cap AS cap_dominio,
    s.id AS casella_id,
    s.email AS casella,
    s.status AS casella_status,
    s.provider,
    s.connection_status,
    (s.smtp_host IS NOT NULL OR s.oauth_connection_id IS NOT NULL OR s.provider NOT IN ('smtp','gmail','outlook')) AS ha_smtp,
    (s.imap_host IS NOT NULL OR s.oauth_connection_id IS NOT NULL) AS ha_imap,
    s.warmup_day,
    s.warmup_started_on,
    LEAST(s.daily_cap_target, GREATEST(0, s.warmup_base + s.warmup_day * s.warmup_step)) AS cap_oggi,
    s.daily_sent,
    s.bounce_count,
    s.complaint_count,
    b.status = 'active' AND d.status = 'active' AND d.spf_verified AND d.dkim_verified AND d.dmarc_verified
      AND (s.status = ANY (ARRAY['active','warming']))
      AND COALESCE(s.connection_status, '') <> 'error'
      AND ((s.provider IN ('gmail','outlook') AND s.oauth_connection_id IS NOT NULL)
           OR (s.provider = 'smtp' AND s.imap_host IS NOT NULL AND s.smtp_host IS NOT NULL)
           OR s.provider NOT IN ('smtp','gmail','outlook')) AS pronta
   FROM public.outreach_brands b
     LEFT JOIN public.outreach_sending_domains d ON d.brand_id = b.id
     LEFT JOIN public.outreach_sender_accounts s ON s.sending_domain_id = d.id
  ORDER BY b.name, d.domain, s.email;
