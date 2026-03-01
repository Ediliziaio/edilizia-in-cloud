
-- Lifecycle notifications table for in-app alerts
CREATE TABLE public.lifecycle_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  notification_date date NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_lifecycle_notif_company ON public.lifecycle_notifications(company_id, is_dismissed, created_at DESC);
CREATE UNIQUE INDEX idx_lifecycle_notif_unique ON public.lifecycle_notifications(company_id, notification_type, notification_date);

ALTER TABLE public.lifecycle_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage lifecycle notifications"
ON public.lifecycle_notifications FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company users view own notifications"
ON public.lifecycle_notifications FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company users update own notifications"
ON public.lifecycle_notifications FOR UPDATE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
