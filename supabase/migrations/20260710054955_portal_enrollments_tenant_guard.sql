-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- FIX 1: hardening WITH CHECK enrollments (membership obbligatoria) — chiude scrittura cross-tenant
DROP POLICY IF EXISTS portal_enrollments_company_access ON public.portal_course_enrollments;

CREATE POLICY portal_enrollments_company_access
  ON public.portal_course_enrollments
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT profiles.company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT multi_company_access.company_id FROM multi_company_access WHERE multi_company_access.user_id = (SELECT auth.uid())
    )
    OR user_id = (SELECT auth.uid())
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid()), 'super_admin'::app_role)
    OR (
      company_id IN (
        SELECT profiles.company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
        UNION
        SELECT multi_company_access.company_id FROM multi_company_access WHERE multi_company_access.user_id = (SELECT auth.uid())
      )
      AND (
        EXISTS (
          SELECT 1 FROM portal_courses pc
          WHERE pc.company_id = portal_course_enrollments.company_id
            AND pc.id = portal_course_enrollments.course_id
        )
        OR EXISTS (
          SELECT 1 FROM portal_course_grants g
          WHERE g.target_company_id = portal_course_enrollments.company_id
            AND g.course_id = portal_course_enrollments.course_id
            AND g.status = 'granted'::text
        )
      )
    )
  );

-- FIX 2: la FK composita rompeva il log activity sui corsi CONCESSI (course_id platform, company_id azienda)
ALTER TABLE public.portal_course_activity
  DROP CONSTRAINT IF EXISTS portal_course_activity_company_id_course_id_fkey;
