-- enroll_entities_in_flow — iscrizione manuale di contatti a un flusso.
--
-- Perche' serve una RPC e non si poteva fare dal client:
--   1. Il bulk enroll faceva upsert(onConflict:"flow_id,entity_id") ma
--      automation_enrollments non ha quell'indice unico -> SQLSTATE 42P10 ad
--      ogni click. Il bottone "Aggiungi ad automazione" non ha MAI funzionato
--      per nessuna azienda (zero eventi manual_enrollment mai registrati).
--   2. L'indice unico NON e' la soluzione: process-automation legge la lista
--      completa delle iscrizioni per (flow, entity) proprio per non mascherare
--      un'iscrizione attiva dietro una riga successiva. Piu' righe sono attese.
--   3. L'insert su automation_trigger_events e' vietato dalle RLS (unica
--      policy: service_role), e comunque l'evento "manual_enrollment" non lo
--      consuma nessuno.
--   4. A far partire davvero un flusso e' la riga in automation_queue sul
--      primo nodo dopo il trigger, non l'iscrizione. Il client non lo faceva.
--
-- SECURITY DEFINER + assert_company_access: stessa barriera multi-tenant del
-- resto del gestionale, senza aprire automation_trigger_events in scrittura.
--
-- NOTA: applicata in produzione via execute_sql il 2026-07-27. Questo file
-- esiste per non far divergere ulteriormente repo e live.

CREATE OR REPLACE FUNCTION public.enroll_entities_in_flow(
  p_flow_id uuid,
  p_entity_ids uuid[],
  p_entity_type text DEFAULT 'contact'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_version int;
  v_trigger_id uuid;
  v_entity uuid;
  v_enrollment_id uuid;
  v_conn record;
  v_enrolled int := 0;
  v_skipped int := 0;
  v_queued int := 0;
BEGIN
  SELECT company_id, version INTO v_company_id, v_version
  FROM automation_flows WHERE id = p_flow_id AND status = 'published';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Flusso non trovato o non pubblicato';
  END IF;

  PERFORM assert_company_access(v_company_id);

  SELECT id INTO v_trigger_id
  FROM automation_nodes
  WHERE flow_id = p_flow_id AND node_type = 'trigger'
  ORDER BY created_at LIMIT 1;

  IF v_trigger_id IS NULL THEN
    RAISE EXCEPTION 'Il flusso non ha un nodo trigger: non puo essere avviato';
  END IF;

  FOREACH v_entity IN ARRAY p_entity_ids LOOP
    IF EXISTS (
      SELECT 1 FROM automation_enrollments
      WHERE flow_id = p_flow_id AND entity_id = v_entity
        AND status IN ('active','waiting')
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF p_entity_type = 'contact' AND NOT EXISTS (
      SELECT 1 FROM marketing_contacts
      WHERE id = v_entity AND company_id = v_company_id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO automation_enrollments (company_id, flow_id, entity_id, entity_type, flow_version, status)
    VALUES (v_company_id, p_flow_id, v_entity, p_entity_type, v_version, 'active')
    RETURNING id INTO v_enrollment_id;
    v_enrolled := v_enrolled + 1;

    FOR v_conn IN
      SELECT to_node_id, label FROM automation_connections
      WHERE flow_id = p_flow_id AND from_node_id = v_trigger_id
    LOOP
      INSERT INTO automation_queue (
        enrollment_id, flow_id, company_id, current_node_id,
        entity_id, entity_type, status, execute_at, context_json
      ) VALUES (
        v_enrollment_id, p_flow_id, v_company_id, v_conn.to_node_id,
        v_entity, p_entity_type, 'pending', now(),
        jsonb_build_object('payload', jsonb_build_object('manual', true), 'branch', v_conn.label)
      );
      v_queued := v_queued + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('enrolled', v_enrolled, 'skipped', v_skipped, 'queued', v_queued);
END;
$function$;

REVOKE ALL ON FUNCTION public.enroll_entities_in_flow(uuid, uuid[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enroll_entities_in_flow(uuid, uuid[], text) TO authenticated;
