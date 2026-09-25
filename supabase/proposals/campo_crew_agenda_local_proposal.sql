-- LOCAL PROPOSAL ONLY. Requires roster + shift proposals. Not a production migration.
-- Personal planning feed, NOT an order/rapportino/Storage authorization source.
-- No writes, no legacy policy changes, no cost or attendance side effects.
-- Private definer is necessary to project ONLY the caller's latest personal
-- shifts: granting SELECT on the source would expose other participants/history.
CREATE OR REPLACE FUNCTION internal_team_planning.my_agenda_v1(c uuid, d_from date, d_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); result jsonb;
BEGIN
  IF me IS NULL OR public.utente_bloccato() IS NOT FALSE OR public.user_can_access_company(c) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501';
  END IF;
  IF d_from IS NULL OR d_to IS NULL OR d_to<d_from OR d_to-d_from>31
    OR d_from<'2000-01-01' OR d_to>'2100-12-31' THEN
    RAISE EXCEPTION 'Scegli un intervallo valido fino a 32 giorni' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'shiftId',s.shift_id,'version',s.id,'companyId',s.company_id,'orderId',s.order_id,
    'teamName',s.team_name,'orderCode',o.order_code,'orderDescription',o.description,
    'address',o.indirizzo_lavori,'phaseName',p.name,
    'workDate',s.work_date,'startTime',to_char(s.start_time,'HH24:MI'),'endTime',to_char(s.end_time,'HH24:MI'),
    'isReferente',EXISTS(SELECT 1 FROM public.employees e WHERE e.id=s.leader_employee_id AND e.company_id=c AND e.user_id=me AND e.is_active),
    'status',s.status
  ) ORDER BY s.work_date,s.start_time,s.shift_id),'[]'::jsonb) INTO result
  FROM public.internal_team_shift_versions s
  JOIN public.orders o ON o.id=s.order_id AND o.company_id=c
  JOIN public.external_teams t ON t.id=s.team_id AND t.company_id=c AND t.kind='interna' AND t.is_active
  LEFT JOIN public.order_work_phases p ON p.id=s.phase_id AND p.order_id=s.order_id AND p.company_id=c
  WHERE s.company_id=c AND s.work_date BETWEEN d_from AND d_to
    -- Check latest across ALL dates/members/statuses. Otherwise moving/removing
    -- a worker would resurrect their old shift through a filtered anti-join.
    AND NOT EXISTS(SELECT 1 FROM public.internal_team_shift_versions newer
      WHERE newer.company_id=c AND newer.shift_id=s.shift_id AND newer.sequence>s.sequence)
    AND EXISTS(SELECT 1 FROM public.employees e
      WHERE e.company_id=c AND e.user_id=me AND e.is_active AND e.id=ANY(s.employee_ids)
      -- Snapshot AND live identity must match. Relinking an employee to a new
      -- account does not silently transfer previously planned personal access.
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.participants) participant
        WHERE participant->>'id'=e.id::text AND participant->>'userId'=me::text
          AND participant->>'kind' IN ('member','replacement')));
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION internal_team_planning.my_agenda_v1(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION internal_team_planning.my_agenda_v1(uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.campo_my_team_shifts_v1(p_company_id uuid,p_from date,p_to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT internal_team_planning.my_agenda_v1(p_company_id,p_from,p_to);
$$;
REVOKE ALL ON FUNCTION public.campo_my_team_shifts_v1(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.campo_my_team_shifts_v1(uuid,date,date) TO authenticated;
