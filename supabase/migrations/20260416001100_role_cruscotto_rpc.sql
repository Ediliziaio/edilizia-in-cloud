-- ════════════════════════════════════════════════════════════════
-- Role-based Cruscotto — Sprint 5.3 RPC
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- get_my_cruscotto_dashboard
--  Ritorna l'id della dashboard da mostrare all'utente corrente su
--  /azienda/cruscotto. Prende il primo ruolo dell'utente che ha una
--  mappatura in company_role_dashboards. Se nessuno → NULL.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_cruscotto_dashboard()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_dashboard_id uuid;
BEGIN
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT crd.dashboard_id INTO v_dashboard_id
  FROM public.company_role_dashboards crd
  JOIN public.user_roles ur ON ur.role = crd.role
  WHERE ur.user_id = auth.uid()
    AND crd.company_id = v_company_id
  ORDER BY
    -- priorità: admin > staff > altri
    CASE crd.role
      WHEN 'company_admin' THEN 1
      WHEN 'company_staff' THEN 2
      WHEN 'salesperson'   THEN 3
      WHEN 'call_center'   THEN 4
      WHEN 'employee'      THEN 5
      ELSE 99
    END
  LIMIT 1;

  RETURN v_dashboard_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_cruscotto_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_cruscotto_dashboard() TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- list_company_role_dashboards
--  Per la UI admin: ritorna la mappa completa {role, dashboard_id, name}
--  per la company corrente.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_company_role_dashboards()
RETURNS TABLE (
  role public.app_role,
  dashboard_id uuid,
  dashboard_name text,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    crd.role,
    crd.dashboard_id,
    d.name AS dashboard_name,
    crd.updated_at,
    crd.updated_by
  FROM public.company_role_dashboards crd
  JOIN public.dashboards d ON d.id = crd.dashboard_id
  WHERE crd.company_id = v_company_id
  ORDER BY crd.role;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_role_dashboards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_role_dashboards() TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- set_company_role_dashboard
--  Upsert la dashboard per un ruolo. Solo company_admin o super_admin.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_company_role_dashboard(
  p_role public.app_role,
  p_dashboard_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_is_admin boolean;
  v_dashboard_company uuid;
BEGIN
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not attached to a company';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('company_admin','super_admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only company_admin can set role dashboard';
  END IF;

  -- Verifica che la dashboard appartenga alla stessa company
  SELECT company_id INTO v_dashboard_company FROM public.dashboards WHERE id = p_dashboard_id;
  IF v_dashboard_company IS NULL THEN
    RAISE EXCEPTION 'Dashboard not found';
  END IF;
  IF v_dashboard_company <> v_company_id THEN
    RAISE EXCEPTION 'Dashboard belongs to a different company';
  END IF;

  INSERT INTO public.company_role_dashboards (company_id, role, dashboard_id, updated_by, updated_at)
  VALUES (v_company_id, p_role, p_dashboard_id, auth.uid(), now())
  ON CONFLICT (company_id, role) DO UPDATE
  SET dashboard_id = EXCLUDED.dashboard_id,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_company_role_dashboard(public.app_role, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_company_role_dashboard(public.app_role, uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- unset_company_role_dashboard
--  Rimuove la mappatura per un ruolo.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unset_company_role_dashboard(p_role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_is_admin boolean;
BEGIN
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not attached to a company';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('company_admin','super_admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only company_admin can unset role dashboard';
  END IF;

  DELETE FROM public.company_role_dashboards
  WHERE company_id = v_company_id AND role = p_role;
END;
$$;

REVOKE ALL ON FUNCTION public.unset_company_role_dashboard(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unset_company_role_dashboard(public.app_role) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- list_dashboard_templates
--  Lista template filtrati opzionalmente per ruolo.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_dashboard_templates(p_role public.app_role DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  target_roles public.app_role[],
  category text,
  icon text,
  sort_order int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.slug, t.name, t.description, t.target_roles, t.category, t.icon, t.sort_order
  FROM public.dashboard_templates t
  WHERE p_role IS NULL
     OR t.target_roles = ARRAY[]::public.app_role[]
     OR p_role = ANY(t.target_roles)
  ORDER BY t.sort_order, t.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_dashboard_templates(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_dashboard_templates(public.app_role) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- clone_template_to_company
--  Crea una nuova dashboard nella company corrente basata sul template.
--  scope: 'personal' (default) o 'company' o 'role:<ruolo>'.
--  Ritorna l'id della nuova dashboard.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clone_template_to_company(
  p_template_id uuid,
  p_scope text DEFAULT 'personal',
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_template RECORD;
  v_new_name text;
  v_new_dashboard_id uuid;
  v_is_admin boolean;
BEGIN
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not attached to a company';
  END IF;

  SELECT * INTO v_template FROM public.dashboard_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- scope 'company' o 'role:*' richiede admin
  IF p_scope = 'company' OR p_scope LIKE 'role:%' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('company_admin','super_admin')
    ) INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Only company_admin can create non-personal dashboards';
    END IF;
  END IF;

  v_new_name := COALESCE(NULLIF(p_name, ''), v_template.name);

  -- Usa save_dashboard per creare la dashboard + prima versione
  -- Passa il layout del template
  SELECT (public.save_dashboard(
    NULL, -- dashboard_id
    v_new_name,
    v_template.description,
    p_scope,
    v_template.icon,
    v_template.layout,
    'Creata da template: ' || v_template.name
  )->>'dashboard_id')::uuid INTO v_new_dashboard_id;

  RETURN v_new_dashboard_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_template_to_company(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_template_to_company(uuid, text, text) TO authenticated;
