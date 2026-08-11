-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Fasi di lavorazione (manodopera per fase) come raggruppamento sopra le tabelle esistenti.
CREATE TABLE IF NOT EXISTS public.order_work_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'da_iniziare',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_work_phases_order ON public.order_work_phases(order_id);

ALTER TABLE public.order_work_phases ENABLE ROW LEVEL SECURITY;

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

-- Colonne di raggruppamento/preventivo sulle tabelle manodopera esistenti.
ALTER TABLE public.order_employees
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.order_work_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_preventivo NUMERIC;

ALTER TABLE public.order_external_teams
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.order_work_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_preventivo NUMERIC;

CREATE INDEX IF NOT EXISTS idx_order_employees_phase ON public.order_employees(phase_id);
CREATE INDEX IF NOT EXISTS idx_order_external_teams_phase ON public.order_external_teams(phase_id);

-- Tabella parallela mai usata: rimossa.
DROP TABLE IF EXISTS public.order_phase_assignments;
