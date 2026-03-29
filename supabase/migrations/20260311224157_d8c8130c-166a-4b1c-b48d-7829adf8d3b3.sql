CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- LEAD / CRM
  lead_new_in_app            boolean NOT NULL DEFAULT true,
  lead_new_email             boolean NOT NULL DEFAULT false,
  lead_new_sms               boolean NOT NULL DEFAULT false,
  lead_assigned_in_app       boolean NOT NULL DEFAULT true,
  lead_assigned_email        boolean NOT NULL DEFAULT true,
  lead_assigned_sms          boolean NOT NULL DEFAULT false,
  lead_stage_changed_in_app  boolean NOT NULL DEFAULT true,
  lead_stage_changed_email   boolean NOT NULL DEFAULT false,
  lead_stage_changed_sms     boolean NOT NULL DEFAULT false,
  lead_won_in_app            boolean NOT NULL DEFAULT true,
  lead_won_email             boolean NOT NULL DEFAULT true,
  lead_won_sms               boolean NOT NULL DEFAULT false,

  -- ORDINI
  order_new_in_app             boolean NOT NULL DEFAULT true,
  order_new_email              boolean NOT NULL DEFAULT true,
  order_new_sms                boolean NOT NULL DEFAULT false,
  order_assigned_in_app        boolean NOT NULL DEFAULT true,
  order_assigned_email         boolean NOT NULL DEFAULT true,
  order_assigned_sms           boolean NOT NULL DEFAULT false,
  order_status_changed_in_app  boolean NOT NULL DEFAULT true,
  order_status_changed_email   boolean NOT NULL DEFAULT false,
  order_status_changed_sms     boolean NOT NULL DEFAULT false,
  order_completed_in_app       boolean NOT NULL DEFAULT true,
  order_completed_email        boolean NOT NULL DEFAULT true,
  order_completed_sms          boolean NOT NULL DEFAULT false,

  -- APPUNTAMENTI
  appointment_new_in_app          boolean NOT NULL DEFAULT true,
  appointment_new_email           boolean NOT NULL DEFAULT true,
  appointment_new_sms             boolean NOT NULL DEFAULT false,
  appointment_reminder_in_app     boolean NOT NULL DEFAULT true,
  appointment_reminder_email      boolean NOT NULL DEFAULT true,
  appointment_reminder_sms        boolean NOT NULL DEFAULT false,
  appointment_cancelled_in_app    boolean NOT NULL DEFAULT true,
  appointment_cancelled_email     boolean NOT NULL DEFAULT true,
  appointment_cancelled_sms       boolean NOT NULL DEFAULT false,
  appointment_rescheduled_in_app  boolean NOT NULL DEFAULT true,
  appointment_rescheduled_email   boolean NOT NULL DEFAULT false,
  appointment_rescheduled_sms     boolean NOT NULL DEFAULT false,

  -- TASK
  task_assigned_in_app  boolean NOT NULL DEFAULT true,
  task_assigned_email   boolean NOT NULL DEFAULT false,
  task_assigned_sms     boolean NOT NULL DEFAULT false,
  task_due_soon_in_app  boolean NOT NULL DEFAULT true,
  task_due_soon_email   boolean NOT NULL DEFAULT false,
  task_due_soon_sms     boolean NOT NULL DEFAULT false,
  task_overdue_in_app   boolean NOT NULL DEFAULT true,
  task_overdue_email    boolean NOT NULL DEFAULT true,
  task_overdue_sms      boolean NOT NULL DEFAULT false,
  task_completed_in_app boolean NOT NULL DEFAULT false,
  task_completed_email  boolean NOT NULL DEFAULT false,
  task_completed_sms    boolean NOT NULL DEFAULT false,

  -- MESSAGGI
  message_whatsapp_in_app        boolean NOT NULL DEFAULT true,
  message_whatsapp_email         boolean NOT NULL DEFAULT false,
  message_whatsapp_sms           boolean NOT NULL DEFAULT false,
  message_email_received_in_app  boolean NOT NULL DEFAULT true,
  message_email_received_email   boolean NOT NULL DEFAULT false,
  message_email_received_sms     boolean NOT NULL DEFAULT false,

  -- REPORT
  report_daily_in_app    boolean NOT NULL DEFAULT false,
  report_daily_email     boolean NOT NULL DEFAULT true,
  report_daily_sms       boolean NOT NULL DEFAULT false,
  report_weekly_in_app   boolean NOT NULL DEFAULT false,
  report_weekly_email    boolean NOT NULL DEFAULT true,
  report_weekly_sms      boolean NOT NULL DEFAULT false,
  report_monthly_in_app  boolean NOT NULL DEFAULT false,
  report_monthly_email   boolean NOT NULL DEFAULT true,
  report_monthly_sms     boolean NOT NULL DEFAULT false,

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
