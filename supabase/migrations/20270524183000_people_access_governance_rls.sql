-- People & Accesses enterprise governance.
-- Enables settings/people access checks for users working on a company through
-- multi_company_access, not only through their profile.company_id.

CREATE OR REPLACE FUNCTION public.can_manage_company_people(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND mca.access_role = 'company_admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_company_people(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_company_people(p_company_id)
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      LEFT JOIN public.staff_permissions sp
        ON sp.user_id = auth.uid()
       AND sp.company_id = mca.company_id
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = p_company_id
        AND (
          COALESCE(sp.can_view_settings_people, false)
          OR COALESCE(sp.can_view_users, false)
        )
    );
$$;

DROP POLICY IF EXISTS "People managers can view granted company profiles" ON public.profiles;
CREATE POLICY "People managers can view granted company profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.can_view_company_people(company_id));

DROP POLICY IF EXISTS "People managers can view company access rows" ON public.multi_company_access;
CREATE POLICY "People managers can view company access rows"
  ON public.multi_company_access
  FOR SELECT
  TO authenticated
  USING (public.can_view_company_people(company_id));

DROP POLICY IF EXISTS "Multi-company admins can manage company access rows" ON public.multi_company_access;
CREATE POLICY "Multi-company admins can manage company access rows"
  ON public.multi_company_access
  FOR ALL
  TO authenticated
  USING (public.can_manage_company_people(company_id))
  WITH CHECK (
    public.can_manage_company_people(company_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = multi_company_access.user_id
    )
  );

DROP POLICY IF EXISTS "People managers can view company staff permissions" ON public.staff_permissions;
CREATE POLICY "People managers can view company staff permissions"
  ON public.staff_permissions
  FOR SELECT
  TO authenticated
  USING (public.can_view_company_people(company_id));

DROP POLICY IF EXISTS "Multi-company admins can manage company staff permissions" ON public.staff_permissions;
CREATE POLICY "Multi-company admins can manage company staff permissions"
  ON public.staff_permissions
  FOR ALL
  TO authenticated
  USING (public.can_manage_company_people(company_id))
  WITH CHECK (
    public.can_manage_company_people(company_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = staff_permissions.user_id
        AND (
          p.company_id = staff_permissions.company_id
          OR EXISTS (
            SELECT 1
            FROM public.multi_company_access mca
            WHERE mca.user_id = p.id
              AND mca.company_id = staff_permissions.company_id
          )
        )
    )
  );
