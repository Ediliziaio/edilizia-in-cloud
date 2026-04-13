-- ============================================================
-- Add 'area' column to employees for calendar & assignment filtering
-- Areas: cantiere (field workers), commerciale (sales/marketing),
--        amministrazione (office/admin), tecnico (technical)
-- ============================================================

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'cantiere';

-- Constraint for valid values
ALTER TABLE employees
ADD CONSTRAINT employees_area_check
CHECK (area IN ('cantiere', 'commerciale', 'amministrazione', 'tecnico'));

-- Backfill: staff_interno defaults to amministrazione
UPDATE employees
SET area = 'amministrazione'
WHERE role_type = 'staff_interno' AND area = 'cantiere';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_employees_area ON employees(area);
CREATE INDEX IF NOT EXISTS idx_employees_company_area ON employees(company_id, area);

COMMENT ON COLUMN employees.area IS 'Area aziendale: cantiere, commerciale, amministrazione, tecnico. Controlla visibilità calendario e filtri assegnazione.';

-- ============================================================
-- Add 'area' to user_roles for profile-level area tracking
-- This allows filtering users (not just employees) by area
-- ============================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS area text DEFAULT NULL;

ALTER TABLE profiles
ADD CONSTRAINT profiles_area_check
CHECK (area IS NULL OR area IN ('cantiere', 'commerciale', 'amministrazione', 'tecnico'));

COMMENT ON COLUMN profiles.area IS 'Area aziendale del profilo utente. Sincronizzato con employees.area se collegato.';
