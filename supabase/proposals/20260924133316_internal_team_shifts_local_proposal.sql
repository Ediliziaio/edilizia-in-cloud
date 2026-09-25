-- LOCAL PROPOSAL ONLY. Requires the roster proposal and current application schema.
-- Planning is NOT attendance, a cost row, or an authorization to use Campo.
-- No legacy tables/policies/triggers are modified. No notifications are sent.

CREATE FUNCTION public.internal_team_shift_allowed_v1(c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND public.utente_bloccato() IS FALSE
    AND public.user_can_access_company(c) IS TRUE
    AND (public.can_manage_company_people(c) IS TRUE
      OR public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) IS TRUE);
$$;
REVOKE ALL ON FUNCTION public.internal_team_shift_allowed_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_team_shift_allowed_v1(uuid) TO authenticated;

CREATE TABLE public.internal_team_shift_versions (
  id uuid PRIMARY KEY,
  shift_id uuid NOT NULL,
  previous_version uuid REFERENCES public.internal_team_shift_versions(id) ON DELETE RESTRICT,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES public.external_teams(id) ON DELETE RESTRICT,
  roster_version uuid NOT NULL REFERENCES public.internal_team_roster_versions(id) ON DELETE RESTRICT,
  phase_id uuid REFERENCES public.order_work_phases(id) ON DELETE RESTRICT,
  work_date date NOT NULL CHECK(work_date BETWEEN '2000-01-01' AND '2100-12-31'),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK(end_time > start_time AND end_time < '24:00'),
  employee_ids uuid[] NOT NULL,
  leader_employee_id uuid,
  notes text NOT NULL DEFAULT '' CHECK(length(notes) <= 1000),
  status text NOT NULL CHECK(status IN ('planned','cancelled')),
  team_name text NOT NULL,
  participants jsonb NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT(company_id, shift_id, previous_version)
);
CREATE INDEX internal_team_shift_latest_idx ON public.internal_team_shift_versions(company_id, shift_id, sequence DESC);
CREATE INDEX internal_team_shift_order_idx ON public.internal_team_shift_versions(company_id, order_id, work_date);
CREATE INDEX internal_team_shift_day_idx ON public.internal_team_shift_versions(company_id, work_date);
CREATE INDEX internal_team_shift_previous_idx ON public.internal_team_shift_versions(previous_version);
CREATE INDEX internal_team_shift_roster_idx ON public.internal_team_shift_versions(roster_version);
CREATE INDEX internal_team_shift_team_idx ON public.internal_team_shift_versions(team_id);
CREATE INDEX internal_team_shift_phase_idx ON public.internal_team_shift_versions(phase_id);
CREATE INDEX internal_team_shift_order_fk_idx ON public.internal_team_shift_versions(order_id);

ALTER TABLE public.internal_team_shift_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_team_shift_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.internal_team_shift_versions TO authenticated;
GRANT INSERT(id,shift_id,previous_version,company_id,order_id,team_id,roster_version,phase_id,work_date,start_time,end_time,employee_ids,leader_employee_id,notes,status)
  ON public.internal_team_shift_versions TO authenticated;
GRANT USAGE ON SEQUENCE public.internal_team_shift_versions_sequence_seq TO authenticated;
CREATE POLICY crew_shift_read ON public.internal_team_shift_versions FOR SELECT TO authenticated
  USING(public.internal_team_shift_allowed_v1(company_id)
    AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=internal_team_shift_versions.order_id AND o.company_id=internal_team_shift_versions.company_id));
CREATE POLICY crew_shift_insert ON public.internal_team_shift_versions FOR INSERT TO authenticated
  WITH CHECK(public.internal_team_shift_allowed_v1(company_id) AND created_by = (SELECT auth.uid()));

-- The only privileged lookup returns a boolean, never another site's names or
-- members. Needed to detect a collision even when the other order is hidden by
-- existing orders RLS. This private schema is NOT exposed through PostgREST.
CREATE SCHEMA IF NOT EXISTS internal_team_planning;
REVOKE ALL ON SCHEMA internal_team_planning FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal_team_planning TO authenticated;
CREATE FUNCTION internal_team_planning.has_overlap_v1(c uuid, s uuid, d date, t_start time, t_end time, ids uuid[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.internal_team_shift_allowed_v1(c) IS NOT TRUE
    OR EXISTS(SELECT 1 FROM unnest(ids) requested WHERE NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=requested AND e.company_id=c)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.internal_team_shift_versions v
    WHERE v.company_id=c AND v.shift_id<>s AND v.work_date=d AND v.status='planned'
      AND v.start_time<t_end AND t_start<v.end_time AND v.employee_ids && ids
      AND NOT EXISTS(SELECT 1 FROM public.internal_team_shift_versions newer WHERE newer.company_id=v.company_id AND newer.shift_id=v.shift_id AND newer.sequence>v.sequence)
  );
END;
$$;
REVOKE ALL ON FUNCTION internal_team_planning.has_overlap_v1(uuid,uuid,date,time,time,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal_team_planning.has_overlap_v1(uuid,uuid,date,time,time,uuid[]) TO authenticated;

-- Validate direct REST inserts as well as RPCs. Versions cannot be updated/deleted.
CREATE FUNCTION public.internal_team_shift_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.internal_team_shift_versions; latest_roster uuid; normalized uuid[]; n integer; base_ids uuid[];
BEGIN
  IF public.internal_team_shift_allowed_v1(NEW.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'I turni richiedono una transazione READ COMMITTED' USING ERRCODE='25001';
  END IF;
  -- Coarse company lock deliberately serializes this small planning workload.
  -- Same ordering for all operations; roster lock is also used by roster saves.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text, 9818));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.team_id::text, 9817));
  SELECT * INTO previous FROM public.internal_team_shift_versions
    WHERE company_id=NEW.company_id AND shift_id=NEW.shift_id ORDER BY sequence DESC LIMIT 1;
  IF previous.id IS DISTINCT FROM NEW.previous_version THEN
    RAISE EXCEPTION 'Turno modificato da un altra sessione' USING ERRCODE='PT409';
  END IF;
  IF previous.id IS NOT NULL AND (previous.order_id <> NEW.order_id OR previous.team_id <> NEW.team_id OR previous.roster_version <> NEW.roster_version) THEN
    RAISE EXCEPTION 'Commessa, squadra e composizione di origine non possono cambiare: crea un nuovo turno' USING ERRCODE='22023';
  END IF;
  IF NEW.status='cancelled' THEN
    IF previous.id IS NULL OR previous.status='cancelled' THEN RAISE EXCEPTION 'Turno non annullabile' USING ERRCODE='22023'; END IF;
    IF (NEW.work_date,NEW.start_time,NEW.end_time,NEW.phase_id,NEW.employee_ids,NEW.leader_employee_id,NEW.notes)
      IS DISTINCT FROM (previous.work_date,previous.start_time,previous.end_time,previous.phase_id,previous.employee_ids,previous.leader_employee_id,previous.notes) THEN
      RAISE EXCEPTION 'Annullamento con dati diversi dal turno corrente' USING ERRCODE='PT409';
    END IF;
    -- Cancellation remains possible after employee/team deactivation. Preserve history.
    NEW.team_name := previous.team_name; NEW.participants := previous.participants;
    NEW.created_by := auth.uid(); NEW.created_at := now(); RETURN NEW;
  END IF;
  IF previous.status='cancelled' THEN RAISE EXCEPTION 'Il turno è annullato: crea un nuovo turno' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=NEW.order_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Commessa non disponibile' USING ERRCODE='42501';
  END IF;
  SELECT name INTO NEW.team_name FROM public.external_teams
    WHERE id=NEW.team_id AND company_id=NEW.company_id AND kind='interna' AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Squadra interna non disponibile' USING ERRCODE='42501'; END IF;
  IF NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_work_phases WHERE id=NEW.phase_id AND order_id=NEW.order_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Lavorazione non appartenente alla commessa' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.internal_team_roster_versions WHERE id=NEW.roster_version AND team_id=NEW.team_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Composizione di origine non disponibile' USING ERRCODE='42501';
  END IF;
  IF previous.id IS NULL THEN
    SELECT id INTO latest_roster FROM public.internal_team_roster_versions WHERE team_id=NEW.team_id AND company_id=NEW.company_id ORDER BY sequence DESC LIMIT 1;
    IF latest_roster IS DISTINCT FROM NEW.roster_version THEN RAISE EXCEPTION 'Composizione modificata da un altra sessione' USING ERRCODE='PT409'; END IF;
  END IF;
  IF cardinality(NEW.employee_ids) IS NULL OR cardinality(NEW.employee_ids) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Scegli da 1 a 100 dipendenti' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id ORDER BY id),count(DISTINCT id) INTO normalized,n FROM unnest(NEW.employee_ids) id;
  IF n <> cardinality(NEW.employee_ids) THEN RAISE EXCEPTION 'Dipendenti duplicati o non validi' USING ERRCODE='22023'; END IF;
  NEW.employee_ids := normalized;
  SELECT count(*) INTO n FROM public.employees WHERE id=ANY(normalized) AND company_id=NEW.company_id AND is_active;
  IF n <> cardinality(normalized) THEN RAISE EXCEPTION 'Dipendenti inattivi, mancanti o di un altra azienda' USING ERRCODE='42501'; END IF;
  IF NEW.leader_employee_id IS NOT NULL AND NOT NEW.leader_employee_id=ANY(normalized) THEN
    RAISE EXCEPTION 'Il referente deve essere presente nel turno' USING ERRCODE='22023';
  END IF;
  IF extract(second FROM NEW.start_time) <> 0 OR extract(second FROM NEW.end_time) <> 0 THEN
    RAISE EXCEPTION 'Usa orari con precisione al minuto' USING ERRCODE='22023';
  END IF;
  -- [start,end): adjacent sites are allowed; overlap across crews/sites is rejected.
  IF internal_team_planning.has_overlap_v1(NEW.company_id,NEW.shift_id,NEW.work_date,NEW.start_time,NEW.end_time,NEW.employee_ids)
    THEN RAISE EXCEPTION 'Una o più persone hanno già un turno sovrapposto. Controlla anche gli altri cantieri' USING ERRCODE='23P01'; END IF;
  SELECT array_agg(employee_id ORDER BY employee_id) INTO base_ids FROM public.internal_team_roster_members WHERE version_id=NEW.roster_version;
  SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',concat_ws(' ',e.first_name,e.last_name),'userId',e.user_id,
      'kind',CASE WHEN NOT e.id=ANY(normalized) THEN 'excluded' WHEN e.id=ANY(base_ids) THEN 'member' ELSE 'replacement' END) ORDER BY e.last_name,e.first_name,e.id)
    INTO NEW.participants FROM public.employees e WHERE e.company_id=NEW.company_id AND (e.id=ANY(normalized) OR e.id=ANY(base_ids));
  NEW.notes := btrim(NEW.notes); NEW.created_by := auth.uid(); NEW.created_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_team_shift_guard_v1() FROM PUBLIC, anon;
CREATE TRIGGER internal_team_shift_guard BEFORE INSERT ON public.internal_team_shift_versions
  FOR EACH ROW EXECUTE FUNCTION public.internal_team_shift_guard_v1();

CREATE FUNCTION public.save_internal_team_shift_v1(
  p_company_id uuid,p_order_id uuid,p_team_id uuid,p_shift_id uuid,p_expected_version uuid,p_operation_id uuid,
  p_roster_version uuid,p_work_date date,p_start_time time,p_end_time time,p_phase_id uuid,
  p_employee_ids uuid[],p_leader_employee_id uuid,p_notes text,p_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE receipt public.internal_team_shift_versions; normalized uuid[];
BEGIN
  IF public.internal_team_shift_allowed_v1(p_company_id) IS NOT TRUE THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
  IF p_operation_id IS NULL OR p_shift_id IS NULL THEN RAISE EXCEPTION 'Identificativi mancanti' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text, 9818));
  SELECT array_agg(id ORDER BY id) INTO normalized FROM unnest(p_employee_ids) id;
  SELECT * INTO receipt FROM public.internal_team_shift_versions WHERE id=p_operation_id;
  IF FOUND THEN
    IF (receipt.company_id,receipt.order_id,receipt.team_id,receipt.shift_id,receipt.previous_version,receipt.roster_version,
        receipt.work_date,receipt.start_time,receipt.end_time,receipt.phase_id,receipt.employee_ids,receipt.leader_employee_id,receipt.notes,receipt.status,receipt.created_by)
      IS DISTINCT FROM (p_company_id,p_order_id,p_team_id,p_shift_id,p_expected_version,p_roster_version,
        p_work_date,p_start_time,p_end_time,p_phase_id,normalized,p_leader_employee_id,btrim(p_notes),p_status,auth.uid()) THEN
      RAISE EXCEPTION 'Richiesta già usata con dati diversi' USING ERRCODE='PT409';
    END IF;
    RETURN receipt.id;
  END IF;
  INSERT INTO public.internal_team_shift_versions(id,shift_id,previous_version,company_id,order_id,team_id,roster_version,phase_id,work_date,start_time,end_time,employee_ids,leader_employee_id,notes,status)
    VALUES(p_operation_id,p_shift_id,p_expected_version,p_company_id,p_order_id,p_team_id,p_roster_version,p_phase_id,p_work_date,p_start_time,p_end_time,normalized,p_leader_employee_id,p_notes,p_status);
  RETURN p_operation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_internal_team_shift_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,time,time,uuid,uuid[],uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_internal_team_shift_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,time,time,uuid,uuid[],uuid,text,text) TO authenticated;

CREATE FUNCTION public.internal_team_shifts_v1(p_company_id uuid,p_order_id uuid,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF public.internal_team_shift_allowed_v1(p_company_id) IS NOT TRUE THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>92 THEN RAISE EXCEPTION 'Scegli un intervallo fino a 93 giorni' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND company_id=p_company_id) THEN RAISE EXCEPTION 'Commessa non disponibile' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'shiftId',s.shift_id,'version',s.id,'expectedVersion',s.previous_version,'rosterVersion',s.roster_version,
    'teamId',s.team_id,'teamName',s.team_name,'phaseId',s.phase_id,'workDate',s.work_date,
    'startTime',to_char(s.start_time,'HH24:MI'),'endTime',to_char(s.end_time,'HH24:MI'),
    'employeeIds',s.employee_ids,'leaderEmployeeId',s.leader_employee_id,'notes',s.notes,'status',s.status,'participants',s.participants
  ) ORDER BY s.work_date,s.start_time,s.sequence),'[]'::jsonb) INTO result
  FROM public.internal_team_shift_versions s
  WHERE s.company_id=p_company_id AND s.order_id=p_order_id AND s.work_date BETWEEN p_from AND p_to
    AND NOT EXISTS(SELECT 1 FROM public.internal_team_shift_versions newer WHERE newer.company_id=s.company_id AND newer.shift_id=s.shift_id AND newer.sequence>s.sequence);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_team_shifts_v1(uuid,uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_team_shifts_v1(uuid,uuid,date,date) TO authenticated;
