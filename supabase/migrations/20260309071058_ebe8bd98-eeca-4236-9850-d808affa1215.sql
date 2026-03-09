
-- =============================================
-- 1. Onboarding Checklist Templates (admin-configured)
-- =============================================
CREATE TABLE public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default',
  description text,
  is_default boolean DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_onboarding_templates" ON public.onboarding_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- =============================================
-- 2. Onboarding Steps (template items)
-- =============================================
CREATE TABLE public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean DEFAULT true,
  auto_check_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_onboarding_steps" ON public.onboarding_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "company_read_onboarding_steps" ON public.onboarding_steps
  FOR SELECT TO authenticated
  USING (true);

-- =============================================
-- 3. Company Onboarding Progress
-- =============================================
CREATE TABLE public.company_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  assigned_cs uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(company_id)
);

ALTER TABLE public.company_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_company_onboarding" ON public.company_onboarding
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "company_read_own_onboarding" ON public.company_onboarding
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- =============================================
-- 4. Company Onboarding Step Completions
-- =============================================
CREATE TABLE public.company_onboarding_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.onboarding_steps(id) ON DELETE CASCADE,
  completed_by uuid,
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE(company_id, step_id)
);

ALTER TABLE public.company_onboarding_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_completions" ON public.company_onboarding_completions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "company_manage_own_completions" ON public.company_onboarding_completions
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- =============================================
-- 5. CS Tasks
-- =============================================
CREATE TABLE public.cs_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'manual',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  due_date date,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cs_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_cs_tasks" ON public.cs_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
