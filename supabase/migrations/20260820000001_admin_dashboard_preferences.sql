-- supabase/migrations/20260820000001_admin_dashboard_preferences.sql
-- Tabella preferenze widget dashboard per ogni super admin

CREATE TABLE IF NOT EXISTS public.admin_dashboard_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  widget_visibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(admin_user_id)
);

-- RLS: solo il proprio admin può leggere/scrivere le proprie preferenze
ALTER TABLE public.admin_dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_own_preferences" ON public.admin_dashboard_preferences
  FOR ALL USING (admin_user_id = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.admin_dashboard_preferences;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.admin_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
