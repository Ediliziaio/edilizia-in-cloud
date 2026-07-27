-- Sblocco trigger cron + avvio manuale, e Registro per le iscrizioni bulk.
--
-- Due bug strutturali, entrambi riprodotti sul DB di produzione prima del fix:
--
--  1. automation_enrollments.entity_id era uuid, ma enrollFlowDirect ci scrive
--     'cron:<flow_id>:<data>' per i trigger cron.
--     -> 42804: column "entity_id" is of type uuid but expression is of type text
--     I trigger cron_giornaliero / cron_settimanale / cron_mensile non hanno mai
--     arruolato nessuno e non potevano farlo.
--     Fix: entity_id diventa text, allineandosi ad automation_queue.entity_id
--     che era gia' text. Nessun indice o FK su questa colonna.
--
--  2. Il CHECK su entity_type non ammetteva 'cron' ne' 'manual', ma
--     enrollFlowDirect li usa (cron e pulsante "Esegui").
--     -> 23514: violates check constraint
--     Il pulsante di avvio manuale non poteva funzionare.
--     Fix: i due valori entrano nella whitelist.
--
-- Entrambi fallivano in silenzio: enrollFlowDirect tornava null senza log. E'
-- lo stesso meccanismo gia' documentato nel motore ("il CHECK entity_type ha
-- nascosto per mesi il fatto che i trigger operativi non arruolavano MAI").
-- Nel commit che accompagna questa migration il fallimento viene loggato.
--
-- NOTA: applicata in produzione via execute_sql il 2026-07-27.

ALTER TABLE public.automation_enrollments
  ALTER COLUMN entity_id TYPE text USING entity_id::text;

ALTER TABLE public.automation_enrollments
  DROP CONSTRAINT IF EXISTS automation_enrollments_entity_type_check;

ALTER TABLE public.automation_enrollments
  ADD CONSTRAINT automation_enrollments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'contact','opportunity','appointment','order','invoice','payment','cost',
    'quote','ticket','stock','task','employee','leave_request','company',
    'cron','manual'
  ]));

-- enroll_entities_in_flow v2:
--  - confronta entity_id come text (la colonna non e' piu' uuid)
--  - scrive flow_execution_runs: senza, le iscrizioni fatte dal bulk erano
--    invisibili in Cronologia, a differenza di quelle di enrollFlowDirect
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
  v_entity_txt text;
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
    v_entity_txt := v_entity::text;

    IF EXISTS (
      SELECT 1 FROM automation_enrollments
      WHERE flow_id = p_flow_id AND entity_id = v_entity_txt
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
    VALUES (v_company_id, p_flow_id, v_entity_txt, p_entity_type, v_version, 'active')
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
        v_entity_txt, p_entity_type, 'pending', now(),
        jsonb_build_object('payload', jsonb_build_object('manual', true), 'branch', v_conn.label)
      );
      v_queued := v_queued + 1;
    END LOOP;

    INSERT INTO flow_execution_runs (flow_id, company_id, enrollment_id, trigger_type, trigger_data, status)
    VALUES (p_flow_id, v_company_id, v_enrollment_id, 'manual_bulk',
            jsonb_build_object('manual', true, 'entity_id', v_entity_txt), 'running');
  END LOOP;

  RETURN jsonb_build_object('enrolled', v_enrolled, 'skipped', v_skipped, 'queued', v_queued);
END;
$function$;

REVOKE ALL ON FUNCTION public.enroll_entities_in_flow(uuid, uuid[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enroll_entities_in_flow(uuid, uuid[], text) TO authenticated;
