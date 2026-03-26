-- Granular settings permissions
-- Replace single can_view_settings/can_edit_settings with per-section toggles

ALTER TABLE staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_settings_profile       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_profile       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_settings_orders        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_orders        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_settings_customization boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_customization boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_settings_people        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_people        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_settings_security      boolean NOT NULL DEFAULT false;

-- Migrate: users who already had can_view_settings = true get the
-- three most common sub-sections (profile + orders + customization)
UPDATE staff_permissions
SET
  can_view_settings_profile       = COALESCE(can_view_settings, false),
  can_edit_settings_profile       = COALESCE(can_edit_settings, false),
  can_view_settings_orders        = COALESCE(can_view_settings, false),
  can_edit_settings_orders        = COALESCE(can_edit_settings, false),
  can_view_settings_customization = COALESCE(can_view_settings, false),
  can_edit_settings_customization = COALESCE(can_edit_settings, false)
WHERE COALESCE(can_view_settings, false) = true;
