-- Fix: infinite recursion (SQLSTATE 42P17) nelle policy RLS di public.surveys.
--
-- CAUSA
--   surveys_select / surveys_update contenevano il subquery:
--     EXISTS (SELECT 1 FROM survey_assignees a
--             WHERE a.survey_id = surveys.id AND a.user_id = auth.uid())
--   e le policy di survey_assignees (assignees_select / assignees_modify)
--   referenziano a loro volta surveys:
--     survey_id IN (SELECT id FROM surveys WHERE company_id = get_my_company_id())
--   Risultato: leggere surveys -> valuta la RLS di survey_assignees -> rivaluta
--   la RLS di surveys -> ricorsione. Ogni SELECT/UPDATE su surveys da parte di
--   un utente non-superadmin falliva con 42P17, rompendo la lista Sopralluoghi
--   e gli update di stato (es. "converted" dopo l'import misure nel preventivo).
--
-- SOLUZIONE
--   Helper SECURITY DEFINER che legge survey_assignees bypassando la sua RLS,
--   usato nelle policy di surveys al posto del subquery diretto. Spezza il ciclo
--   in entrambe le direzioni: surveys -> survey_assignees non innesca piu' la
--   RLS di quest'ultima, quindi nessuna ricorsione.

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

-- Ricrea surveys_select senza il subquery ricorsivo
DROP POLICY IF EXISTS surveys_select ON public.surveys;
CREATE POLICY surveys_select ON public.surveys
  FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    OR public.is_survey_assignee(id)
    OR public.is_super_admin()
  );

-- Ricrea surveys_update senza il subquery ricorsivo
-- (USING vale anche come WITH CHECK, come nella policy originale)
DROP POLICY IF EXISTS surveys_update ON public.surveys;
CREATE POLICY surveys_update ON public.surveys
  FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    OR public.is_survey_assignee(id)
  );
