-- 2. Tabella leave_balances
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year                  integer NOT NULL,
  ferie_days_total      numeric(5,2) NOT NULL DEFAULT 0,
  ferie_days_used       numeric(5,2) NOT NULL DEFAULT 0,
  permessi_hours_total  numeric(6,2) NOT NULL DEFAULT 0,
  permessi_hours_used   numeric(6,2) NOT NULL DEFAULT 0,
  rol_hours_total       numeric(6,2) NOT NULL DEFAULT 0,
  rol_hours_used        numeric(6,2) NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id, year)
);
