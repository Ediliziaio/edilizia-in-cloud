
-- 1. Add probability, expected_close_date, loss_reason, loss_notes to marketing_opportunities
ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS probability integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS loss_notes text;

-- 2. Opportunity loss reasons table (company-specific)
CREATE TABLE IF NOT EXISTS public.opportunity_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.opportunity_loss_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage loss reasons"
  ON public.opportunity_loss_reasons FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- 3. Google Calendar webhook columns
ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS webhook_channel_id text,
  ADD COLUMN IF NOT EXISTS webhook_resource_id text,
  ADD COLUMN IF NOT EXISTS webhook_expiry_at timestamptz;

-- 4. Appointment reminders tracking table
CREATE TABLE IF NOT EXISTS public.appointment_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  UNIQUE(appointment_id, reminder_type)
);

ALTER TABLE public.appointment_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for reminders"
  ON public.appointment_reminders_sent FOR ALL
  TO authenticated
  USING (false);
