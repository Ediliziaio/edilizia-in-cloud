-- ============================================================
-- Admin Dashboard Preferences — widget layout persistence
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_layout JSONB DEFAULT '[]'::jsonb,
  widget_visibility JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.admin_dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- Super admins can manage their own preferences
CREATE POLICY "admin_dashboard_prefs_own" ON public.admin_dashboard_preferences
  FOR ALL
  USING (admin_user_id = auth.uid())
  WITH CHECK (admin_user_id = auth.uid());

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_admin_dashboard_prefs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_dashboard_prefs_updated ON public.admin_dashboard_preferences;
CREATE TRIGGER trg_admin_dashboard_prefs_updated
  BEFORE UPDATE ON public.admin_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_admin_dashboard_prefs_updated_at();
