-- Add visible_areas column to staff_permissions
-- This controls which employee areas a user can see in calendar/dropdowns.
-- Empty array = all areas visible (backwards compatible).
-- Example: ['commerciale'] means user only sees commercial employees.

ALTER TABLE staff_permissions
  ADD COLUMN IF NOT EXISTS visible_areas text[] NOT NULL DEFAULT '{}';

-- Comment for documentation
COMMENT ON COLUMN staff_permissions.visible_areas IS
  'Employee areas visible to this user. Empty = all areas (admin/full access). Values: cantiere, commerciale, amministrazione, tecnico';
