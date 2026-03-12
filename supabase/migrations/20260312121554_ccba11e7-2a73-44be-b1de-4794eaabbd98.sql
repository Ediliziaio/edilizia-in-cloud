
ALTER TABLE public.admin_notification_prefs
  ADD COLUMN IF NOT EXISTS new_company_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trial_expiring_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_ticket_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_failed_alert_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS company_suspended_alert_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_referral_signup_email boolean NOT NULL DEFAULT false;
