-- Laboratorio locale: non applicata al gestionale online.
-- Modificare una commessa non autorizza a leggere la tariffa di una persona.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Le due procedure interne continuano a valorizzare il costo senza esporlo
-- all'utente che registra le ore. Il calcolo resta chiuso ai client.
DO $audit$
DECLARE nome text; definizione text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['fn_rapportino_costo_manodopera', 'ufficio_registra_ore'] LOOP
    FOR definizione IN
      SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace AND p.proname=nome
        AND p.prosecdef AND position('public.costo_orario_dipendente(' in p.prosrc)>0
    LOOP
      EXECUTE replace(definizione,'public.costo_orario_dipendente(', 'public.costo_orario_calcolato(');
    END LOOP;
  END LOOP;
END $audit$;

CREATE OR REPLACE FUNCTION public.costo_orario_dipendente(p_employee_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.costo_orario_calcolato(e.id),0)
  FROM public.employees e
  WHERE e.id=p_employee_id
    AND (
      coalesce(auth.role(),'')='service_role'
      OR (
        auth.uid() IS NOT NULL
        AND public.user_can_access_company(e.company_id)
        AND public.has_permission_for_company(auth.uid(),'can_view_costs',e.company_id)
        AND (public.has_permission_for_company(auth.uid(),'can_view_employees',e.company_id)
          OR public.has_permission_for_company(auth.uid(),'can_view_persone',e.company_id))
      )
    )
$function$;
REVOKE ALL ON FUNCTION public.costo_orario_dipendente(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.costo_orario_dipendente(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.costo_orario_calcolato(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.costo_orario_calcolato(uuid) TO service_role;
COMMENT ON FUNCTION public.costo_orario_dipendente(uuid) IS 'Tariffa individuale: permesso costi e accesso dipendenti/HR nella stessa azienda. La modifica delle commesse da sola non concede accesso.';

-- Assegnazione operativa: il chiamante riceve solo l'ID della riga.
-- I valori economici vengono calcolati e salvati internamente.
CREATE OR REPLACE FUNCTION public.commessa_assegna_persona(
  p_order_id uuid, p_employee_id uuid DEFAULT NULL, p_phase_id uuid DEFAULT NULL,
  p_planned_hours numeric DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE o public.orders; e public.employees; r uuid; tariffa numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL;
  IF NOT FOUND OR auth.uid() IS NULL
    OR NOT coalesce(public.user_can_access_company(o.company_id),false)
    OR NOT coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',o.company_id),false)
    OR NOT coalesce(public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id),false)
    OR coalesce(public.utente_sola_lettura(o.company_id),false) THEN
    RAISE EXCEPTION 'Assegnazione non consentita' USING ERRCODE='42501';
  END IF;
  IF (p_employee_id IS NULL) = (p_user_id IS NULL) THEN
    RAISE EXCEPTION 'Indica una sola persona' USING ERRCODE='22023';
  END IF;
  IF p_planned_hours IS NOT NULL AND (p_planned_hours < 0 OR p_planned_hours::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'Ore previste non valide' USING ERRCODE='22023';
  END IF;
  SELECT * INTO e FROM public.employees WHERE company_id=o.company_id
    AND coalesce(is_active,true)
    AND ((p_employee_id IS NOT NULL AND id=p_employee_id)
      OR (p_user_id IS NOT NULL AND user_id=p_user_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Dipendente non disponibile nella commessa' USING ERRCODE='42501'; END IF;
  IF p_phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_work_phases WHERE id=p_phase_id AND order_id=o.id) THEN
    RAISE EXCEPTION 'Lavorazione non disponibile nella commessa' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(o.id::text||':'||e.id::text||':'||coalesce(p_phase_id::text,''),0));
  SELECT id INTO r FROM public.order_employees WHERE order_id=o.id AND employee_id=e.id
    AND phase_id IS NOT DISTINCT FROM p_phase_id ORDER BY created_at,id LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;
  tariffa := public.costo_orario_calcolato(e.id);
  INSERT INTO public.order_employees(order_id,employee_id,phase_id,hours_worked,hourly_rate,total_cost,
    planned_hours,planned_hourly_rate,cost_preventivo)
  VALUES(o.id,e.id,p_phase_id,0,coalesce(tariffa,0),0,p_planned_hours,
    CASE WHEN p_planned_hours IS NOT NULL THEN tariffa END,round(p_planned_hours*tariffa,2)) RETURNING id INTO r;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.commessa_assegna_persona(uuid,uuid,uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commessa_assegna_persona(uuid,uuid,uuid,numeric,uuid) TO authenticated;
