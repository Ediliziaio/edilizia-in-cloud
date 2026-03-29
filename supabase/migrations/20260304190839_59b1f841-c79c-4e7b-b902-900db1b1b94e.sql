ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_marketing_dashboard boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_contacts boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_marketing_contacts boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_opportunities boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_marketing_opportunities boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_activities boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_appointments boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_automations boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_ai_agent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_whatsapp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_marketing_reports boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings boolean DEFAULT false;
