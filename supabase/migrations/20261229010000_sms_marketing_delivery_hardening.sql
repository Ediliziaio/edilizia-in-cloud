-- SMS Marketing: controlli invio, multipart e reportistica operativa.

DO $$
BEGIN
  ALTER TABLE public.sms_campaigns
    DROP CONSTRAINT IF EXISTS sms_campaigns_messaggio_check;

  ALTER TABLE public.sms_campaigns
    ADD CONSTRAINT sms_campaigns_messaggio_check
    CHECK (char_length(messaggio) BETWEEN 1 AND 1530);

  ALTER TABLE public.sms_templates
    DROP CONSTRAINT IF EXISTS sms_templates_messaggio_check;

  ALTER TABLE public.sms_templates
    ADD CONSTRAINT sms_templates_messaggio_check
    CHECK (char_length(messaggio) BETWEEN 1 AND 1530);
END $$;

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS parti_sms integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS costo_per_sms_snapshot numeric(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_totale_cliente numeric(10,4) NOT NULL DEFAULT 0;

ALTER TABLE public.sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_parti_sms_check;

ALTER TABLE public.sms_campaigns
  ADD CONSTRAINT sms_campaigns_parti_sms_check
  CHECK (parti_sms BETWEEN 1 AND 10);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_programmate
  ON public.sms_campaigns (company_id, programmata_per)
  WHERE stato = 'pianificata';

CREATE INDEX IF NOT EXISTS idx_sms_contacts_sms_sendable
  ON public.sms_contacts (company_id, telefono)
  WHERE opt_out = false AND consenso_marketing = true;

CREATE INDEX IF NOT EXISTS idx_sms_log_campaign_phone
  ON public.sms_log (campagna_id, telefono)
  WHERE campagna_id IS NOT NULL;
