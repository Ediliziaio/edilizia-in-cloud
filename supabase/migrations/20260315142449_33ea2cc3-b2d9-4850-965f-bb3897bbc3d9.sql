ALTER TABLE public.staff_permissions 
  ADD COLUMN IF NOT EXISTS can_view_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_prima_nota boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_costs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_persone boolean NOT NULL DEFAULT false;