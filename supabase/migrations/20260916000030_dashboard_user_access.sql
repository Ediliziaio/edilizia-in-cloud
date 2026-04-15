-- ════════════════════════════════════════════════════════════════════════════
-- Dashboard User Access + Scope Update + List Members + Delete Dashboard
-- Sprint 5.6 — accesso utenti individuali e visibilità modificabile
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dashboard_user_access — accesso per singolo utente ad una dashboard
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_user_access (
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id)  ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id)    ON DELETE CASCADE,
  granted_by   uuid           REFERENCES auth.users(id),
  granted_at   timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (dashboard_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dua_dashboard ON public.dashboard_user_access(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dua_user      ON public.dashboard_user_access(user_id);

ALTER TABLE public.dashboard_user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dua_read_company" ON public.dashboard_user_access;
CREATE POLICY "dua_read_company"
  ON public.dashboard_user_access FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "dua_write_owner" ON public.dashboard_user_access;
CREATE POLICY "dua_write_owner"
  ON public.dashboard_user_access FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id AND d.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id AND d.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. list_company_members
--    Ritorna tutti i profili della company dell'utente corrente,
--    con il ruolo primario e l'avatar (se presente).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_company_members()
RETURNS TABLE (
  user_id    uuid,
  first_name text,
  last_name  text,
  email      text,
  role       public.app_role
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
    RAISE EXCEPTION 'Utente non associato a nessuna azienda';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                                           AS user_id,
    p.first_name,
    p.last_name,
    p.email,
    (SELECT ur.role FROM public.user_roles ur
     WHERE ur.user_id = p.id
     ORDER BY CASE ur.role
       WHEN 'super_admin'    THEN 1
       WHEN 'company_admin'  THEN 2
       WHEN 'company_staff'  THEN 3
       WHEN 'salesperson'    THEN 4
       WHEN 'call_center'    THEN 5
       WHEN 'employee'       THEN 6
       ELSE 99
     END
     LIMIT 1)                                                      AS role
  FROM public.profiles p
  WHERE p.company_id = v_company_id
  ORDER BY p.first_name, p.last_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_members() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. update_dashboard_scope
--    Cambia la visibilità (scope) di una dashboard: personal ↔ company.
--    Solo il proprietario può farlo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_dashboard_scope(
  p_dashboard_id uuid,
  p_scope        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.dashboards
  WHERE id = p_dashboard_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard non trovata';
  END IF;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo il proprietario può cambiare la visibilità';
  END IF;

  IF p_scope NOT IN ('personal', 'company') THEN
    RAISE EXCEPTION 'Scope non valido: usa "personal" o "company"';
  END IF;

  UPDATE public.dashboards
  SET scope = p_scope, updated_at = now()
  WHERE id = p_dashboard_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_dashboard_scope(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_dashboard_scope(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. set_dashboard_user_access / unset_dashboard_user_access
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_dashboard_user_access(
  p_dashboard_id uuid,
  p_user_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id   uuid;
  v_company_id uuid;
BEGIN
  SELECT owner_id, company_id
  INTO v_owner_id, v_company_id
  FROM public.dashboards
  WHERE id = p_dashboard_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard non trovata';
  END IF;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo il proprietario può gestire gli accessi';
  END IF;

  -- Verifica che l'utente target sia nella stessa company
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Utente non appartiene alla stessa azienda';
  END IF;

  INSERT INTO public.dashboard_user_access (dashboard_id, user_id, company_id, granted_by)
  VALUES (p_dashboard_id, p_user_id, v_company_id, auth.uid())
  ON CONFLICT (dashboard_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_dashboard_user_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_dashboard_user_access(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unset_dashboard_user_access(
  p_dashboard_id uuid,
  p_user_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.dashboards
  WHERE id = p_dashboard_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard non trovata';
  END IF;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo il proprietario può gestire gli accessi';
  END IF;

  DELETE FROM public.dashboard_user_access
  WHERE dashboard_id = p_dashboard_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unset_dashboard_user_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unset_dashboard_user_access(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. delete_dashboard
--    Elimina una dashboard e tutte le sue versioni. Solo il proprietario.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_dashboard(p_dashboard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.dashboards
  WHERE id = p_dashboard_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard non trovata';
  END IF;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Non autorizzato: solo il proprietario può eliminare questa dashboard';
  END IF;

  DELETE FROM public.dashboard_versions      WHERE dashboard_id = p_dashboard_id;
  DELETE FROM public.company_role_dashboards WHERE dashboard_id = p_dashboard_id;
  DELETE FROM public.dashboard_user_access   WHERE dashboard_id = p_dashboard_id;
  DELETE FROM public.dashboards              WHERE id           = p_dashboard_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_dashboard(uuid) TO authenticated;
