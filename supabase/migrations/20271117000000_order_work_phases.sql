-- Manodopera per fase: lavorazioni di una commessa (es. ristrutturazione)
-- Ogni fase può avere più esecutori (operai interni + squadre esterne),
-- ciascuno con costo preventivo e consuntivo per controllare lo scostamento.

-- ── Fasi di lavorazione ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_work_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'da_iniziare', -- 'da_iniziare' | 'in_corso' | 'completata'
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Assegnazioni esecutori per fase ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_phase_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES public.order_work_phases(id) ON DELETE CASCADE,
  executor_type TEXT NOT NULL, -- 'interno' | 'esterno'
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  external_team_id UUID REFERENCES public.external_teams(id) ON DELETE SET NULL,
  cost_preventivo NUMERIC NOT NULL DEFAULT 0,
  cost_consuntivo NUMERIC NOT NULL DEFAULT 0,
  hours NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_work_phases_order ON public.order_work_phases(order_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_order ON public.order_phase_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_phase ON public.order_phase_assignments(phase_id);

ALTER TABLE public.order_work_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_phase_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: order_work_phases
DROP POLICY IF EXISTS "Company admins manage their order work phases" ON public.order_work_phases;
CREATE POLICY "Company admins manage their order work phases"
ON public.order_work_phases FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND
  company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Super admins manage all order work phases" ON public.order_work_phases;
CREATE POLICY "Super admins manage all order work phases"
ON public.order_work_phases FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS: order_phase_assignments
DROP POLICY IF EXISTS "Company admins manage their phase assignments" ON public.order_phase_assignments;
CREATE POLICY "Company admins manage their phase assignments"
ON public.order_phase_assignments FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND
  company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Super admins manage all phase assignments" ON public.order_phase_assignments;
CREATE POLICY "Super admins manage all phase assignments"
ON public.order_phase_assignments FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
