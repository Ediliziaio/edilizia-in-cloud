-- P2-02: Campaign retry configuration
ALTER TABLE public.internal_outbound_campaigns
  ADD COLUMN IF NOT EXISTS retry_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_max_attempts INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS retry_delay_minutes INTEGER DEFAULT 60;

COMMENT ON COLUMN public.internal_outbound_campaigns.retry_enabled IS 'Riprova chiamate non risposte';
COMMENT ON COLUMN public.internal_outbound_campaigns.retry_max_attempts IS 'Numero massimo tentativi (oltre il primo)';
COMMENT ON COLUMN public.internal_outbound_campaigns.retry_delay_minutes IS 'Minuti di attesa tra un tentativo e l''altro';

-- Track retry attempts per contact per campaign
CREATE TABLE IF NOT EXISTS public.campaign_retry_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.internal_outbound_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  result TEXT,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_retry_log_campaign ON public.campaign_retry_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_retry_log_contact ON public.campaign_retry_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_retry_log_next ON public.campaign_retry_log(next_retry_at) WHERE next_retry_at IS NOT NULL;

ALTER TABLE public.campaign_retry_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access_retry_log" ON public.campaign_retry_log
  USING (
    campaign_id IN (
      SELECT id FROM public.internal_outbound_campaigns
      WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );
