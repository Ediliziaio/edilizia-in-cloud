
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

-- Migrate existing data: if can_view_marketing was true, enable all marketing sub-modules
UPDATE public.staff_permissions
SET
  can_view_marketing_dashboard = can_view_marketing,
  can_view_marketing_contacts = can_view_marketing,
  can_edit_marketing_contacts = can_edit_marketing,
  can_view_marketing_opportunities = can_view_marketing,
  can_edit_marketing_opportunities = can_edit_marketing,
  can_view_marketing_activities = can_view_marketing,
  can_view_marketing_appointments = can_view_marketing,
  can_view_marketing_automations = can_view_marketing,
  can_view_marketing_ai_agent = can_view_marketing,
  can_view_marketing_email = can_view_marketing,
  can_view_marketing_whatsapp = can_view_marketing,
  can_view_marketing_reports = can_view_marketing
WHERE can_view_marketing = true;
