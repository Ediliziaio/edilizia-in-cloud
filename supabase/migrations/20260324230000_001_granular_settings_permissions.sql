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
