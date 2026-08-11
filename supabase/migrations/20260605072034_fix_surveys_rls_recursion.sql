-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


CREATE OR REPLACE FUNCTION public.is_survey_assignee(p_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.survey_assignees a
    WHERE a.survey_id = p_survey_id
      AND a.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_survey_assignee(uuid) IS
  'True se l''utente corrente e'' assegnato al sopralluogo. SECURITY DEFINER per evitare la ricorsione RLS surveys <-> survey_assignees (42P17).';

REVOKE ALL ON FUNCTION public.is_survey_assignee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_survey_assignee(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS surveys_select ON public.surveys;
CREATE POLICY surveys_select ON public.surveys
  FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    OR public.is_survey_assignee(id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS surveys_update ON public.surveys;
CREATE POLICY surveys_update ON public.surveys
  FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    OR public.is_survey_assignee(id)
  );
