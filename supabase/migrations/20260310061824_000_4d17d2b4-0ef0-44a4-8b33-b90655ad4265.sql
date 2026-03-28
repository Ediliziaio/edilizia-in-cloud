-- ============================================
-- HR Module: leave_requests + leave_balances
-- ============================================

-- 1. Tabella leave_requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('ferie','permesso','malattia','congedo')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  total_days    numeric(5,2),
  total_hours   numeric(5,2),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  notes         text,
  approved_by   uuid,
  approved_at   timestamptz,
  rejection_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_duration_check CHECK (
    total_days IS NOT NULL OR total_hours IS NOT NULL
  ),
  CONSTRAINT leave_dates_check CHECK (end_date >= start_date)
);
