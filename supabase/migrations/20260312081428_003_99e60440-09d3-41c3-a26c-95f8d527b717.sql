-- Nuove colonne notifiche
ALTER TABLE public.admin_notification_prefs
  ADD COLUMN IF NOT EXISTS payment_failed_alert    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS company_suspended_alert BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_referral_signup      BOOLEAN NOT NULL DEFAULT false;
