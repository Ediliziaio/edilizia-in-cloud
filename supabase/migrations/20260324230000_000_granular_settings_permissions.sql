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
