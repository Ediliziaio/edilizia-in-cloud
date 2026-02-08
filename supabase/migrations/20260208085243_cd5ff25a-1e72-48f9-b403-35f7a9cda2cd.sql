-- Add must_change_password flag to staff_permissions
ALTER TABLE staff_permissions 
ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;

-- Set existing staff members to not need password change
UPDATE staff_permissions SET must_change_password = false WHERE must_change_password IS NULL;