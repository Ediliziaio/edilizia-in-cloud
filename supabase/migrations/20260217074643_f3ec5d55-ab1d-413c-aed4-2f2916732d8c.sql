
CREATE TABLE public.admin_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  new_company boolean NOT NULL DEFAULT true,
  trial_expiring boolean NOT NULL DEFAULT true,
  new_ticket boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage their own prefs"
ON public.admin_notification_prefs
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role) AND user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) AND user_id = auth.uid());

CREATE TRIGGER update_admin_notification_prefs_updated_at
BEFORE UPDATE ON public.admin_notification_prefs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
