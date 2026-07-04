-- Personale — Ruolo, Task e KPI per persona (mansionario + catalogo)
-- Fase 1: schema + RLS admin (pattern hr_documenti_admin: get_my_company_id() + has_role).

CREATE TABLE IF NOT EXISTS public.hr_mansioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  area text,
  descrizione text,
  responsabilita jsonb NOT NULL DEFAULT '[]'::jsonb,
  kpi_suggeriti jsonb NOT NULL DEFAULT '[]'::jsonb,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, nome)
);

ALTER TABLE public.hr_profili
  ADD COLUMN IF NOT EXISTS mansione_id uuid REFERENCES public.hr_mansioni(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsabilita jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.hr_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  titolo text NOT NULL,
  descrizione text,
  priorita text NOT NULL DEFAULT 'media' CHECK (priorita IN ('bassa','media','alta')),
  scadenza date,
  stato text NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare','in_corso','fatto','annullato')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_kpi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  nome text NOT NULL,
  unita text NOT NULL DEFAULT 'num' CHECK (unita IN ('num','%','ore','€')),
  target numeric,
  direzione text NOT NULL DEFAULT 'su' CHECK (direzione IN ('su','giu')),
  periodo text NOT NULL DEFAULT 'mensile' CHECK (periodo IN ('mensile','trimestrale','annuale')),
  tipo text NOT NULL DEFAULT 'manuale' CHECK (tipo IN ('manuale','auto')),
  auto_metric text CHECK (auto_metric IN ('presenza_pct','ore_mese','task_completati')),
  origine_mansione_id uuid REFERENCES public.hr_mansioni(id) ON DELETE SET NULL,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_kpi_valori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES public.hr_kpi(id) ON DELETE CASCADE,
  periodo_label text NOT NULL,
  valore numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, periodo_label)
);

CREATE INDEX IF NOT EXISTS idx_hr_task_profilo ON public.hr_task(profilo_id);
CREATE INDEX IF NOT EXISTS idx_hr_kpi_profilo ON public.hr_kpi(profilo_id);
CREATE INDEX IF NOT EXISTS idx_hr_mansioni_company ON public.hr_mansioni(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_kpi_valori_kpi ON public.hr_kpi_valori(kpi_id);

ALTER TABLE public.hr_mansioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_kpi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_kpi_valori ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_mansioni_admin ON public.hr_mansioni
  FOR ALL
  USING (company_id = get_my_company_id() AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK (company_id = get_my_company_id() AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY hr_task_admin ON public.hr_task
  FOR ALL
  USING (company_id = get_my_company_id() AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK (company_id = get_my_company_id() AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY hr_kpi_admin ON public.hr_kpi
  FOR ALL
  USING (company_id = get_my_company_id() AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK (company_id = get_my_company_id() AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY hr_kpi_valori_admin ON public.hr_kpi_valori
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.hr_kpi k WHERE k.id = hr_kpi_valori.kpi_id AND k.company_id = get_my_company_id())
         AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hr_kpi k WHERE k.id = hr_kpi_valori.kpi_id AND k.company_id = get_my_company_id())
         AND (has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
