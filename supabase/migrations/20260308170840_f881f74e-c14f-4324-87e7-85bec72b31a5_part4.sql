-- 3. sms_logs table
CREATE TABLE IF NOT EXISTS public.sms_logs (
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
