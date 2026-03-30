-- ============================================
-- 1. call_logs table
-- ============================================
CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_sec integer NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'no_answer',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
