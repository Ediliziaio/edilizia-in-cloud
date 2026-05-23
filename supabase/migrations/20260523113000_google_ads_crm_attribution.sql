-- Google Ads CRM attribution bridge
-- Collega il CRM esistente a Google Ads offline conversions senza mischiare Meta e Google.

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS google_customer_id text,
  ADD COLUMN IF NOT EXISTS google_campaign_id text,
  ADD COLUMN IF NOT EXISTS google_ad_group_id text,
  ADD COLUMN IF NOT EXISTS google_ad_id text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS wbraid text,
  ADD COLUMN IF NOT EXISTS gbraid text,
  ADD COLUMN IF NOT EXISTS last_google_conversion_event_at timestamptz;

ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS google_customer_id text,
  ADD COLUMN IF NOT EXISTS google_campaign_id text,
  ADD COLUMN IF NOT EXISTS google_ad_group_id text,
  ADD COLUMN IF NOT EXISTS google_ad_id text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS wbraid text,
  ADD COLUMN IF NOT EXISTS gbraid text,
  ADD COLUMN IF NOT EXISTS last_google_conversion_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_sale_sent_at timestamptz;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS google_customer_id text,
  ADD COLUMN IF NOT EXISTS google_campaign_id text,
  ADD COLUMN IF NOT EXISTS google_ad_group_id text,
  ADD COLUMN IF NOT EXISTS google_ad_id text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS wbraid text,
  ADD COLUMN IF NOT EXISTS gbraid text,
  ADD COLUMN IF NOT EXISTS last_google_conversion_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_appointment_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_google_campaign
  ON public.marketing_contacts(company_id, google_campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_gclid
  ON public.marketing_contacts(company_id, gclid);
CREATE INDEX IF NOT EXISTS idx_marketing_opportunities_google_campaign
  ON public.marketing_opportunities(company_id, google_campaign_id);
CREATE INDEX IF NOT EXISTS idx_appointments_google_campaign
  ON public.appointments(company_id, google_campaign_id);

CREATE TABLE IF NOT EXISTS public.google_ads_offline_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'appointment', 'opportunity')),
  entity_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('lead_created', 'appointment_scheduled', 'opportunity_won')),
  conversion_name text NOT NULL,
  event_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, entity_type, entity_id, event_kind)
);

ALTER TABLE public.google_ads_offline_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company google offline conversion events" ON public.google_ads_offline_conversion_events;
CREATE POLICY "Users can view own company google offline conversion events"
  ON public.google_ads_offline_conversion_events FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage google offline conversion events" ON public.google_ads_offline_conversion_events;
CREATE POLICY "Service role can manage google offline conversion events"
  ON public.google_ads_offline_conversion_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_google_ads_offline_conversion_events_pending
  ON public.google_ads_offline_conversion_events(status, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_google_ads_offline_conversion_events_company
  ON public.google_ads_offline_conversion_events(company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_marketing_contact_google_attributed(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact record;
BEGIN
  SELECT source, source_campaign_id, attr_source, attr_medium,
         google_campaign_id, google_ad_group_id, google_ad_id,
         gclid, wbraid, gbraid
    INTO v_contact
  FROM public.marketing_contacts
  WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN
    v_contact.google_campaign_id IS NOT NULL OR
    v_contact.google_ad_group_id IS NOT NULL OR
    v_contact.google_ad_id IS NOT NULL OR
    v_contact.gclid IS NOT NULL OR
    v_contact.wbraid IS NOT NULL OR
    v_contact.gbraid IS NOT NULL OR
    lower(coalesce(v_contact.source, '')) LIKE '%google ads%' OR
    lower(coalesce(v_contact.source, '')) LIKE '%google_ads%' OR
    lower(coalesce(v_contact.source, '')) LIKE '%adwords%' OR
    lower(coalesce(v_contact.attr_source, '')) IN ('google', 'google_ads', 'adwords') OR
    lower(coalesce(v_contact.attr_medium, '')) IN ('cpc', 'ppc', 'paid_search');
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_google_ads_offline_conversion_event(
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_kind text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversion_name text;
  v_event_id text;
  v_id uuid;
BEGIN
  v_conversion_name := CASE p_event_kind
    WHEN 'appointment_scheduled' THEN 'CRM Appointment'
    WHEN 'opportunity_won' THEN 'CRM Sale'
    ELSE 'CRM Lead'
  END;
  v_event_id := 'google-crm:' || p_company_id::text || ':' || p_entity_type || ':' || p_entity_id::text || ':' || p_event_kind;

  INSERT INTO public.google_ads_offline_conversion_events (
    company_id, entity_type, entity_id, event_kind, conversion_name, event_id
  )
  VALUES (
    p_company_id, p_entity_type, p_entity_id, p_event_kind, v_conversion_name, v_event_id
  )
  ON CONFLICT (company_id, entity_type, entity_id, event_kind)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_google_contact_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_marketing_contact_google_attributed(NEW.id) THEN
    PERFORM public.enqueue_google_ads_offline_conversion_event(NEW.company_id, 'contact', NEW.id, 'lead_created');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_google_contact_lead_event ON public.marketing_contacts;
CREATE TRIGGER trg_enqueue_google_contact_lead_event
  AFTER INSERT OR UPDATE OF source, source_campaign_id, attr_source, attr_medium, google_campaign_id, google_ad_id, gclid, wbraid, gbraid
  ON public.marketing_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_google_contact_lead_event();

CREATE OR REPLACE FUNCTION public.enqueue_google_appointment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL
     AND lower(coalesce(NEW.status, '')) NOT IN ('cancelled', 'canceled', 'annullato')
     AND public.is_marketing_contact_google_attributed(NEW.contact_id) THEN
    PERFORM public.enqueue_google_ads_offline_conversion_event(NEW.company_id, 'appointment', NEW.id, 'appointment_scheduled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_google_appointment_event ON public.appointments;
CREATE TRIGGER trg_enqueue_google_appointment_event
  AFTER INSERT OR UPDATE OF status, contact_id, google_campaign_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_google_appointment_event();

CREATE OR REPLACE FUNCTION public.enqueue_google_opportunity_won_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL
     AND lower(coalesce(NEW.status, '')) IN ('won', 'closed_won', 'vinto')
     AND (TG_OP = 'INSERT' OR lower(coalesce(OLD.status, '')) NOT IN ('won', 'closed_won', 'vinto'))
     AND public.is_marketing_contact_google_attributed(NEW.contact_id) THEN
    PERFORM public.enqueue_google_ads_offline_conversion_event(NEW.company_id, 'opportunity', NEW.id, 'opportunity_won');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_google_opportunity_won_event ON public.marketing_opportunities;
CREATE TRIGGER trg_enqueue_google_opportunity_won_event
  AFTER INSERT OR UPDATE OF status, contact_id, google_campaign_id
  ON public.marketing_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_google_opportunity_won_event();

COMMENT ON TABLE public.google_ads_offline_conversion_events IS
  'Coda idempotente di conversioni CRM attribuite a Google Ads. Separata da Meta CAPI; pronta per upload offline conversions/enhanced conversions for leads.';
