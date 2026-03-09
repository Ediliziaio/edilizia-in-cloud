
-- =============================================
-- FASE 1: Database Schema + Security Functions
-- =============================================

-- 1. New columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS require_2fa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip INET;

-- 2. New columns on companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS enforce_2fa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allowed_ips TEXT[],
  ADD COLUMN IF NOT EXISTS password_expiry_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_failed_attempts INT NOT NULL DEFAULT 5;

-- 3. New columns on staff_permissions
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_export_clients BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_delete_orders BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_payments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_approve_orders BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_all_team_calendar BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_margins BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_suppliers BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_financial_reports BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_warehouse_items BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Table: user_sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  device_type TEXT, -- desktop, mobile, tablet
  browser TEXT,
  os TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  revoke_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_company_id ON public.user_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(is_active) WHERE is_active = TRUE;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sessions_select_admin"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "user_sessions_insert_self"
  ON public.user_sessions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "user_sessions_update_admin"
  ON public.user_sessions FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR user_id = auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 5. Table: login_attempts
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON public.login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON public.login_attempts(user_id);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_attempts_select_admin"
  ON public.login_attempts FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT p.id FROM public.profiles p WHERE p.company_id = public.get_my_company_id()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Insert policy: service role only (no authenticated insert needed, handled by function)
CREATE POLICY "login_attempts_insert_service"
  ON public.login_attempts FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- 6. Table: permission_templates
CREATE TABLE IF NOT EXISTS public.permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permission_templates_company ON public.permission_templates(company_id);

ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perm_templates_select"
  ON public.permission_templates FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR is_system_default = TRUE
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "perm_templates_insert"
  ON public.permission_templates FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "perm_templates_update"
  ON public.permission_templates FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id() AND is_system_default = FALSE
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "perm_templates_delete"
  ON public.permission_templates FOR DELETE TO authenticated
  USING (
    (company_id = public.get_my_company_id() AND is_system_default = FALSE
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

-- 7. Table: user_audit_log
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- user_created, permissions_changed, session_revoked, password_reset, role_changed, user_locked, user_unlocked
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_company ON public.user_audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_target ON public.user_audit_log(target_user_id);

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_audit_log_select_admin"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "user_audit_log_insert"
  ON public.user_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 8. Table: teams
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  leader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_company ON public.teams(company_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select"
  ON public.teams FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "teams_insert"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "teams_update"
  ON public.teams FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "teams_delete"
  ON public.teams FOR DELETE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

-- 9. Table: team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member', -- member, leader, coordinator
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_company ON public.team_members(company_id);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_select"
  ON public.team_members FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "team_members_insert"
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "team_members_update"
  ON public.team_members FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

CREATE POLICY "team_members_delete"
  ON public.team_members FOR DELETE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );

-- 10. Function: check_and_update_login_attempt
CREATE OR REPLACE FUNCTION public.check_and_update_login_attempt(
  p_user_id UUID,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
  v_failed_count INT;
  v_max_attempts INT;
  v_company_id UUID;
BEGIN
  -- Get current state
  SELECT p.locked_until, p.failed_login_count, p.company_id
  INTO v_locked_until, v_failed_count, v_company_id
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_not_found');
  END IF;

  -- Check if currently locked
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'account_locked',
      'locked_until', v_locked_until
    );
  END IF;

  -- Get max_failed_attempts from company
  SELECT COALESCE(c.max_failed_attempts, 5) INTO v_max_attempts
  FROM public.companies c
  WHERE c.id = v_company_id;

  v_max_attempts := COALESCE(v_max_attempts, 5);

  IF p_success THEN
    -- Reset counters on success
    UPDATE public.profiles
    SET failed_login_count = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        last_login_ip = p_ip_address
    WHERE id = p_user_id;

    RETURN jsonb_build_object('allowed', true);
  ELSE
    -- Increment failure counter
    v_failed_count := v_failed_count + 1;

    IF v_failed_count >= v_max_attempts THEN
      -- Lock account for 30 minutes
      UPDATE public.profiles
      SET failed_login_count = v_failed_count,
          locked_until = NOW() + INTERVAL '30 minutes'
      WHERE id = p_user_id;

      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'account_locked',
        'locked_until', NOW() + INTERVAL '30 minutes',
        'attempts', v_failed_count
      );
    ELSE
      UPDATE public.profiles
      SET failed_login_count = v_failed_count
      WHERE id = p_user_id;

      RETURN jsonb_build_object(
        'allowed', true,
        'remaining_attempts', v_max_attempts - v_failed_count
      );
    END IF;
  END IF;
END;
$$;
