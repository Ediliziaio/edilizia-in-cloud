-- Allow people managers to read identity rows for users granted to the
-- selected company through multi_company_access. The previous profile policy
-- only evaluated profiles.company_id, so granted users whose primary profile
-- belongs to another company could disappear from People & Accesses.

DROP POLICY IF EXISTS "People managers can view granted access profile identities" ON public.profiles;
CREATE POLICY "People managers can view granted access profile identities"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = profiles.id
        AND public.can_view_company_people(mca.company_id)
    )
  );
