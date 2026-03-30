-- =============================================
-- 2. Onboarding Steps (template items)
-- =============================================
CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean DEFAULT true,
  auto_check_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
