-- LOCAL PROPOSAL ONLY. Not in migrations: the historical migration chain contains
-- later-dated prerequisites. Do not db-push this file or enable the UI remotely.
-- Prerequisites: external_teams.kind, employees.user_id and existing permission helpers.
-- Roster versions are organizational snapshots, never Campo grants or cost rows.

CREATE FUNCTION public.internal_team_roster_allowed_v1(p_company_id uuid, p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.utente_bloccato() IS FALSE
    AND public.user_can_access_company(p_company_id) IS TRUE
    AND (
      public.can_manage_company_people(p_company_id) IS TRUE
      OR public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) IS TRUE
      OR (NOT p_write AND public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company_id) IS TRUE)
    );
$$;
REVOKE ALL ON FUNCTION public.internal_team_roster_allowed_v1(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_team_roster_allowed_v1(uuid, boolean) TO authenticated;

CREATE TABLE public.internal_team_roster_versions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES public.external_teams(id) ON DELETE RESTRICT,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  parent_version uuid REFERENCES public.internal_team_roster_versions(id) ON DELETE RESTRICT,
  leader_employee_id uuid REFERENCES public.employees(id) ON DELETE RESTRICT,
  effective_from date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Rome')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_tx bigint NOT NULL DEFAULT txid_current(),
  UNIQUE(company_id, id)
);
CREATE INDEX internal_team_roster_latest_idx ON public.internal_team_roster_versions(company_id, team_id, sequence DESC);
CREATE INDEX internal_team_roster_team_idx ON public.internal_team_roster_versions(team_id);
CREATE INDEX internal_team_roster_parent_idx ON public.internal_team_roster_versions(parent_version);
CREATE INDEX internal_team_roster_leader_idx ON public.internal_team_roster_versions(leader_employee_id);

CREATE TABLE public.internal_team_roster_members (
  version_id uuid NOT NULL,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  PRIMARY KEY(version_id, employee_id),
  FOREIGN KEY(company_id, version_id) REFERENCES public.internal_team_roster_versions(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX internal_team_roster_members_employee_idx ON public.internal_team_roster_members(employee_id);
CREATE INDEX internal_team_roster_members_company_idx ON public.internal_team_roster_members(company_id, version_id);
ALTER TABLE public.internal_team_roster_versions ADD CONSTRAINT internal_team_roster_leader_is_member
  FOREIGN KEY(id, leader_employee_id) REFERENCES public.internal_team_roster_members(version_id, employee_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.internal_team_roster_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_team_roster_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_team_roster_versions, public.internal_team_roster_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.internal_team_roster_versions, public.internal_team_roster_members TO authenticated;
GRANT USAGE ON SEQUENCE public.internal_team_roster_versions_sequence_seq TO authenticated;

CREATE POLICY crew_versions_read ON public.internal_team_roster_versions FOR SELECT TO authenticated
  USING (public.internal_team_roster_allowed_v1(company_id, false));
CREATE POLICY crew_versions_insert ON public.internal_team_roster_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.internal_team_roster_allowed_v1(company_id, true)
    AND created_by = (SELECT auth.uid()) AND created_tx = txid_current()
    AND effective_from = ((now() AT TIME ZONE 'Europe/Rome')::date)
    AND EXISTS (SELECT 1 FROM public.external_teams t WHERE t.id = team_id AND t.company_id = internal_team_roster_versions.company_id AND t.kind = 'interna' AND t.is_active)
    AND (parent_version IS NULL OR EXISTS (SELECT 1 FROM public.internal_team_roster_versions old WHERE old.id = internal_team_roster_versions.parent_version AND old.team_id = internal_team_roster_versions.team_id AND old.company_id = internal_team_roster_versions.company_id))
  );
CREATE POLICY crew_members_read ON public.internal_team_roster_members FOR SELECT TO authenticated
  USING (public.internal_team_roster_allowed_v1(company_id, false));
CREATE POLICY crew_members_insert ON public.internal_team_roster_members FOR INSERT TO authenticated
  WITH CHECK (
    public.internal_team_roster_allowed_v1(company_id, true)
    AND EXISTS (SELECT 1 FROM public.internal_team_roster_versions v WHERE v.id = version_id AND v.company_id = internal_team_roster_members.company_id AND v.created_by = (SELECT auth.uid()) AND v.created_tx = txid_current())
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.company_id = internal_team_roster_members.company_id AND e.is_active)
  );

-- Deferred completeness: direct API inserts must not leave an empty roster either.
CREATE FUNCTION public.internal_team_roster_complete_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.internal_team_roster_members WHERE version_id = NEW.id;
  IF n < 1 OR n > 100 THEN RAISE EXCEPTION 'La squadra deve contenere da 1 a 100 dipendenti' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_team_roster_complete_v1() FROM PUBLIC, anon;
CREATE CONSTRAINT TRIGGER internal_team_roster_complete AFTER INSERT ON public.internal_team_roster_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.internal_team_roster_complete_v1();

CREATE FUNCTION public.save_internal_team_roster_v1(
  p_company_id uuid, p_team_id uuid, p_expected_version uuid, p_operation_id uuid,
  p_employee_ids uuid[], p_leader_employee_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE latest uuid; previous public.internal_team_roster_versions; selected_ids uuid[]; saved_ids uuid[]; n integer;
BEGIN
  IF public.internal_team_roster_allowed_v1(p_company_id, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_team_id IS NULL THEN RAISE EXCEPTION 'Identificativi mancanti' USING ERRCODE = '22023'; END IF;
  -- Same team always takes one lock, independent of operation ID. No network in transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_team_id::text, 9817));
  IF cardinality(p_employee_ids) IS NULL OR cardinality(p_employee_ids) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Scegli da 1 a 100 dipendenti' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(id ORDER BY id), count(DISTINCT id) INTO selected_ids, n FROM unnest(p_employee_ids) id;
  IF n <> cardinality(p_employee_ids) THEN RAISE EXCEPTION 'Dipendenti duplicati o non validi' USING ERRCODE = '22023'; END IF;
  IF p_leader_employee_id IS NOT NULL AND NOT p_leader_employee_id = ANY(selected_ids) THEN
    RAISE EXCEPTION 'Il referente deve appartenere alla squadra' USING ERRCODE = '22023';
  END IF;
  -- An uncertain reply can be retried even after a later legitimate roster change.
  SELECT * INTO previous FROM public.internal_team_roster_versions WHERE id = p_operation_id;
  IF FOUND THEN
    SELECT array_agg(employee_id ORDER BY employee_id) INTO saved_ids FROM public.internal_team_roster_members WHERE version_id = previous.id;
    IF previous.company_id <> p_company_id OR previous.team_id <> p_team_id OR previous.created_by <> auth.uid()
       OR previous.parent_version IS DISTINCT FROM p_expected_version OR previous.leader_employee_id IS DISTINCT FROM p_leader_employee_id
       OR saved_ids IS DISTINCT FROM selected_ids THEN
      RAISE EXCEPTION 'Richiesta già usata con dati diversi' USING ERRCODE = 'PT409';
    END IF;
    RETURN previous.id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.external_teams WHERE id = p_team_id AND company_id = p_company_id AND kind = 'interna' AND is_active) THEN
    RAISE EXCEPTION 'Squadra interna non disponibile' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO latest FROM public.internal_team_roster_versions WHERE company_id = p_company_id AND team_id = p_team_id ORDER BY sequence DESC LIMIT 1;
  IF latest IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Composizione modificata da un altra sessione' USING ERRCODE = 'PT409'; END IF;
  SELECT count(*) INTO n FROM public.employees WHERE id = ANY(selected_ids) AND company_id = p_company_id AND is_active;
  IF n <> cardinality(selected_ids) THEN RAISE EXCEPTION 'Dipendenti inattivi, non disponibili o di un altra azienda' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.internal_team_roster_versions(id, company_id, team_id, parent_version, leader_employee_id)
    VALUES(p_operation_id, p_company_id, p_team_id, p_expected_version, p_leader_employee_id);
  INSERT INTO public.internal_team_roster_members(version_id, company_id, employee_id)
    SELECT p_operation_id, p_company_id, id FROM unnest(selected_ids) id;
  RETURN p_operation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_internal_team_roster_v1(uuid, uuid, uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_internal_team_roster_v1(uuid, uuid, uuid, uuid, uuid[], uuid) TO authenticated;

CREATE FUNCTION public.internal_team_roster_v1(p_company_id uuid, p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE team public.external_teams; latest public.internal_team_roster_versions; ids jsonb; employees jsonb;
BEGIN
  IF public.internal_team_roster_allowed_v1(p_company_id, false) IS NOT TRUE THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  SELECT * INTO team FROM public.external_teams WHERE id = p_team_id AND company_id = p_company_id AND kind = 'interna';
  IF NOT FOUND THEN RAISE EXCEPTION 'Squadra interna non disponibile' USING ERRCODE = '42501'; END IF;
  SELECT * INTO latest FROM public.internal_team_roster_versions WHERE company_id = p_company_id AND team_id = p_team_id ORDER BY sequence DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(employee_id ORDER BY employee_id), '[]'::jsonb) INTO ids FROM public.internal_team_roster_members WHERE version_id = latest.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', concat_ws(' ', e.first_name, e.last_name), 'active', e.is_active, 'userId', e.user_id) ORDER BY e.last_name, e.first_name, e.id), '[]'::jsonb)
    INTO employees FROM public.employees e WHERE e.company_id = p_company_id;
  RETURN jsonb_build_object('teamId', team.id, 'teamName', team.name, 'teamActive', team.is_active,
    'canManage', public.internal_team_roster_allowed_v1(p_company_id, true),
    'roster', jsonb_build_object('version', latest.id, 'employeeIds', ids, 'leaderEmployeeId', latest.leader_employee_id, 'effectiveFrom', latest.effective_from),
    'employees', employees);
END;
$$;
REVOKE ALL ON FUNCTION public.internal_team_roster_v1(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_team_roster_v1(uuid, uuid) TO authenticated;
