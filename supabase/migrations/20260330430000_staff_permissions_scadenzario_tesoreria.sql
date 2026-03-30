-- BUG 5: Add dedicated can_view_scadenzario and can_view_tesoreria columns
-- Previously both were mapped from can_view_billing, conflating three distinct features.
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_scadenzario boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_tesoreria boolean NOT NULL DEFAULT false;

-- Back-fill from can_view_billing for existing rows so no access is lost
UPDATE public.staff_permissions
SET
  can_view_scadenzario = can_view_billing,
  can_view_tesoreria   = can_view_billing
WHERE can_view_billing = true;
