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
