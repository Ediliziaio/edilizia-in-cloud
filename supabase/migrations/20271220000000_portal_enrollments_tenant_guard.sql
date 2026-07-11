-- ============================================================================
-- Portale Formazione — hardening RLS enrollments + FK activity per corsi grant
-- ============================================================================
--
-- FIX 1 (SICUREZZA, cross-tenant write):
--   La policy `portal_enrollments_company_access` aveva un WITH CHECK che NON
--   verificava l'appartenenza dell'utente all'azienda in `company_id`:
--       super_admin OR corso-posseduto-da(company_id) OR grant-verso(company_id)
--   Per un INSERT conta solo il WITH CHECK → un utente autenticato qualsiasi
--   poteva inserire righe in portal_course_enrollments con company_id di UN'ALTRA
--   azienda (bastava che quell'azienda possedesse/avesse in grant il corso),
--   forgiando iscrizioni e completamenti (es. falsi "sicurezza" nei report
--   compliance di un altro tenant).
--   Qui si aggiunge in AND il vincolo di membership (profiles ∪ multi_company_access),
--   preservando i due flussi legittimi (corso proprio / corso concesso) e il
--   super_admin. La USING resta invariata.
--
-- FIX 2 (funzionalità grant):
--   portal_course_activity conserva ancora la FK composita
--   (company_id, course_id) → portal_courses(company_id, id), mentre per gli
--   enrollments era già stata rimossa (migration grants). Su un corso CONCESSO
--   il learner logga activity con company_id=azienda e course_id=corso-platform:
--   la coppia non esiste in portal_courses(azienda, corso) → violazione FK ad
--   OGNI evento. La log è await-ata insieme al salvataggio del progresso, quindi
--   l'utente vede "Avanzamento non salvato" a ogni spunta. Si allinea la tabella
--   agli enrollments: via la FK composita, si tiene quella su companies.

BEGIN;

-- ── FIX 1 ────────────────────────────────────────────────────────────────────
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
      -- membership: company_id deve essere un'azienda dell'utente
      company_id IN (
        SELECT profiles.company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
        UNION
        SELECT multi_company_access.company_id FROM multi_company_access WHERE multi_company_access.user_id = (SELECT auth.uid())
      )
      AND (
        -- corso di proprietà dell'azienda…
        EXISTS (
          SELECT 1 FROM portal_courses pc
          WHERE pc.company_id = portal_course_enrollments.company_id
            AND pc.id = portal_course_enrollments.course_id
        )
        -- …oppure corso concesso a quell'azienda via grant attivo
        OR EXISTS (
          SELECT 1 FROM portal_course_grants g
          WHERE g.target_company_id = portal_course_enrollments.company_id
            AND g.course_id = portal_course_enrollments.course_id
            AND g.status = 'granted'::text
        )
      )
    )
  );

-- ── FIX 2 ────────────────────────────────────────────────────────────────────
ALTER TABLE public.portal_course_activity
  DROP CONSTRAINT IF EXISTS portal_course_activity_company_id_course_id_fkey;

COMMIT;
