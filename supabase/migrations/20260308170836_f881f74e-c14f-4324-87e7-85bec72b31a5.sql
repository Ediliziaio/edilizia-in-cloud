
-- 1. telnyx_settings table
CREATE TABLE public.telnyx_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_encrypted text NOT NULL,
  messaging_profile_id text,
  connection_id text,
  webhook_signing_secret_encrypted text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telnyx_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage telnyx_settings"
  ON public.telnyx_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 2. Add Telnyx columns to ai_agent_phone_numbers
ALTER TABLE public.ai_agent_phone_numbers
  ADD COLUMN IF NOT EXISTS telnyx_phone_id text,
  ADD COLUMN IF NOT EXISTS elevenlabs_phone_number_id text,
  ADD COLUMN IF NOT EXISTS monthly_cost_eur numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS telnyx_connection_id text,
  ADD COLUMN IF NOT EXISTS is_inbound_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_outbound_enabled boolean DEFAULT true;

-- 3. sms_logs table
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound',
  from_number text,
  to_number text,
  body text,
  status text NOT NULL DEFAULT 'queued',
  telnyx_message_id text,
  cost_eur numeric DEFAULT 0,
  automation_id uuid,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sms_logs_company_id ON public.sms_logs(company_id);
CREATE INDEX idx_sms_logs_telnyx_message_id ON public.sms_logs(telnyx_message_id);

CREATE POLICY "Company users can view their sms_logs"
  ON public.sms_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Super admins full access sms_logs"
  ON public.sms_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
