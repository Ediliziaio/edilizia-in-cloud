-- Lead Scraper · Outreach reale + tracking (invio email + aperture/click)
-- Ogni invio crea una riga 'sent'; la edge function pubblica lead-scraper-track
-- aggiorna opened_at/clicked_at quando il destinatario apre o clicca.

CREATE TABLE IF NOT EXISTS public.lead_scraper_outreach (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      uuid NOT NULL REFERENCES public.lead_scraper_results(id) ON DELETE CASCADE,
  channel      text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp')),
  step         integer NOT NULL DEFAULT 1,
  subject      text,
  to_addr      text,
  status       text NOT NULL DEFAULT 'sent'
               CHECK (status IN ('sent','opened','clicked','replied','bounced','failed')),
  message_id   text,
  opened_at    timestamptz,
  clicked_at   timestamptz,
  replied_at   timestamptz,
  bounced_at   timestamptz,
  open_count   integer NOT NULL DEFAULT 0,
  click_count  integer NOT NULL DEFAULT 0,
  meta         jsonb,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_scraper_outreach IS
  'Invii outreach (email/WhatsApp) ai lead, con tracking aperture/click.';

CREATE INDEX IF NOT EXISTS idx_lss_outreach_lead   ON public.lead_scraper_outreach (lead_id);
CREATE INDEX IF NOT EXISTS idx_lss_outreach_status ON public.lead_scraper_outreach (status);
CREATE INDEX IF NOT EXISTS idx_lss_outreach_created ON public.lead_scraper_outreach (created_at DESC);

ALTER TABLE public.lead_scraper_outreach ENABLE ROW LEVEL SECURITY;
-- super_admin legge/gestisce; l'edge function (service-role) bypassa la RLS.
DROP POLICY IF EXISTS "super_admin read outreach" ON public.lead_scraper_outreach;
CREATE POLICY "super_admin read outreach"
  ON public.lead_scraper_outreach FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ── Stato outreach per lead (per badge in tabella / dettaglio) ────────────────
CREATE OR REPLACE VIEW public.lead_scraper_outreach_by_lead
WITH (security_invoker = true) AS
SELECT
  lead_id,
  count(*)                                        AS sends,
  max(created_at)                                 AS last_send_at,
  bool_or(opened_at  IS NOT NULL)                 AS opened,
  bool_or(clicked_at IS NOT NULL)                 AS clicked,
  bool_or(replied_at IS NOT NULL)                 AS replied,
  sum(open_count)                                 AS opens,
  sum(click_count)                                AS clicks
FROM public.lead_scraper_outreach
GROUP BY lead_id;

COMMENT ON VIEW public.lead_scraper_outreach_by_lead IS
  'Riepilogo outreach per lead: invii, ultima data, aperture/click/risposte.';

GRANT SELECT ON public.lead_scraper_outreach_by_lead TO authenticated;
