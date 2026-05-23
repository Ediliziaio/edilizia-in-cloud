-- Meta Ads CRM attribution bridge
-- Collega il CRM esistente a KPI pubblicitari e Conversions API senza creare un secondo CRM.

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_lead_id text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS last_capi_event_at timestamptz;

ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_lead_id text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS last_capi_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS capi_purchase_sent_at timestamptz;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_id text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS last_capi_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS capi_schedule_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_meta_campaign
  ON public.marketing_contacts(company_id, meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_source_campaign
  ON public.marketing_contacts(company_id, source_campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_opportunities_meta_campaign
  ON public.marketing_opportunities(company_id, meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_appointments_meta_campaign
  ON public.appointments(company_id, meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_status
  ON public.appointments(company_id, contact_id, status);

CREATE TABLE IF NOT EXISTS public.meta_crm_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'appointment', 'opportunity')),
  entity_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('lead_created', 'appointment_scheduled', 'opportunity_won')),
  event_name text NOT NULL CHECK (event_name IN ('Lead', 'Schedule', 'Purchase')),
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

ALTER TABLE public.meta_crm_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company crm conversion events" ON public.meta_crm_conversion_events;
CREATE POLICY "Users can view own company crm conversion events"
  ON public.meta_crm_conversion_events FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage crm conversion events" ON public.meta_crm_conversion_events;
CREATE POLICY "Service role can manage crm conversion events"
  ON public.meta_crm_conversion_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_meta_crm_conversion_events_pending
  ON public.meta_crm_conversion_events(status, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_meta_crm_conversion_events_company
  ON public.meta_crm_conversion_events(company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_marketing_contact_meta_attributed(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact record;
BEGIN
  SELECT source, source_campaign_id, attr_source, attr_medium, meta_campaign_id, meta_adset_id, meta_ad_id
    INTO v_contact
  FROM public.marketing_contacts
  WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN
    v_contact.source_campaign_id IS NOT NULL OR
    v_contact.meta_campaign_id IS NOT NULL OR
    v_contact.meta_adset_id IS NOT NULL OR
    v_contact.meta_ad_id IS NOT NULL OR
    lower(coalesce(v_contact.source, '')) LIKE '%meta%' OR
    lower(coalesce(v_contact.source, '')) LIKE '%facebook%' OR
    lower(coalesce(v_contact.source, '')) LIKE '%instagram%' OR
    lower(coalesce(v_contact.attr_source, '')) IN ('facebook', 'meta', 'instagram') OR
    lower(coalesce(v_contact.attr_medium, '')) = 'paid_social';
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_meta_crm_conversion_event(
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
  v_event_name text;
  v_event_id text;
  v_id uuid;
BEGIN
  v_event_name := CASE p_event_kind
    WHEN 'appointment_scheduled' THEN 'Schedule'
    WHEN 'opportunity_won' THEN 'Purchase'
    ELSE 'Lead'
  END;
  v_event_id := 'crm:' || p_company_id::text || ':' || p_entity_type || ':' || p_entity_id::text || ':' || v_event_name;

  INSERT INTO public.meta_crm_conversion_events (
    company_id, entity_type, entity_id, event_kind, event_name, event_id
  )
  VALUES (
    p_company_id, p_entity_type, p_entity_id, p_event_kind, v_event_name, v_event_id
  )
  ON CONFLICT (company_id, entity_type, entity_id, event_kind)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_meta_contact_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_marketing_contact_meta_attributed(NEW.id) THEN
    PERFORM public.enqueue_meta_crm_conversion_event(NEW.company_id, 'contact', NEW.id, 'lead_created');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_meta_contact_lead_event ON public.marketing_contacts;
CREATE TRIGGER trg_enqueue_meta_contact_lead_event
  AFTER INSERT OR UPDATE OF source, source_campaign_id, attr_source, attr_medium, meta_campaign_id, meta_ad_id
  ON public.marketing_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_contact_lead_event();

CREATE OR REPLACE FUNCTION public.enqueue_meta_appointment_schedule_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL
     AND lower(coalesce(NEW.status, '')) NOT IN ('cancelled', 'canceled', 'annullato')
     AND public.is_marketing_contact_meta_attributed(NEW.contact_id) THEN
    PERFORM public.enqueue_meta_crm_conversion_event(NEW.company_id, 'appointment', NEW.id, 'appointment_scheduled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_meta_appointment_schedule_event ON public.appointments;
CREATE TRIGGER trg_enqueue_meta_appointment_schedule_event
  AFTER INSERT OR UPDATE OF status, contact_id, meta_campaign_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_appointment_schedule_event();

CREATE OR REPLACE FUNCTION public.enqueue_meta_opportunity_won_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL
     AND lower(coalesce(NEW.status, '')) IN ('won', 'closed_won', 'vinto')
     AND (TG_OP = 'INSERT' OR lower(coalesce(OLD.status, '')) NOT IN ('won', 'closed_won', 'vinto'))
     AND public.is_marketing_contact_meta_attributed(NEW.contact_id) THEN
    PERFORM public.enqueue_meta_crm_conversion_event(NEW.company_id, 'opportunity', NEW.id, 'opportunity_won');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_meta_opportunity_won_event ON public.marketing_opportunities;
CREATE TRIGGER trg_enqueue_meta_opportunity_won_event
  AFTER INSERT OR UPDATE OF status, contact_id, meta_campaign_id
  ON public.marketing_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_opportunity_won_event();

COMMENT ON TABLE public.meta_crm_conversion_events IS
  'Coda idempotente di conversioni CRM attribuite a Meta Ads. Edge function meta-crm-conversion-sync invia a Conversions API.';
