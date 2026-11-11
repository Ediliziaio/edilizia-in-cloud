CREATE SCHEMA IF NOT EXISTS migration_solaria;
REVOKE ALL ON SCHEMA migration_solaria FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA migration_solaria TO service_role;

CREATE TABLE migration_solaria.drip_state (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  next_slot_at timestamptz NOT NULL,
  used_in_slot integer NOT NULL DEFAULT 0 CHECK (used_in_slot >= 0),
  PRIMARY KEY (company_id, flow_id, node_id)
);
CREATE TABLE migration_solaria.drip_reservations (
  queue_id uuid PRIMARY KEY REFERENCES public.automation_queue(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  reserved_at timestamptz NOT NULL
);
ALTER TABLE migration_solaria.drip_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_solaria.drip_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA migration_solaria FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA migration_solaria TO service_role;

CREATE FUNCTION public.solaria_reserve_drip_slot(
  p_company uuid, p_flow uuid, p_node uuid, p_queue uuid,
  p_batch integer, p_seconds integer, p_now timestamptz DEFAULT clock_timestamp()
) RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE state migration_solaria.drip_state%ROWTYPE; prior migration_solaria.drip_reservations%ROWTYPE;
  slot timestamptz; used integer;
BEGIN
  IF p_batch IS NULL OR p_batch < 1 OR p_batch > 1000 OR p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 86400 OR p_now IS NULL THEN
    RAISE EXCEPTION 'Intervallo o lotto non valido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.automation_queue q JOIN public.automation_nodes n ON n.id=q.current_node_id
    WHERE q.id=p_queue AND q.company_id=p_company AND q.flow_id=p_flow AND q.current_node_id=p_node
      AND n.company_id=p_company AND n.flow_id=p_flow AND n.config_json->>'item_id'='squadd_drip'
      AND n.config_json->>'migration_source_node_id' IS NOT NULL
  ) THEN RAISE EXCEPTION 'Esecuzione o nodo non appartenente al flusso'; END IF;
  INSERT INTO migration_solaria.drip_state(company_id,flow_id,node_id,next_slot_at)
    VALUES(p_company,p_flow,p_node,p_now) ON CONFLICT DO NOTHING;
  SELECT * INTO state FROM migration_solaria.drip_state
    WHERE company_id=p_company AND flow_id=p_flow AND node_id=p_node FOR UPDATE;
  SELECT * INTO prior FROM migration_solaria.drip_reservations WHERE queue_id=p_queue;
  IF FOUND THEN
    IF prior.company_id<>p_company OR prior.flow_id<>p_flow OR prior.node_id<>p_node THEN RAISE EXCEPTION 'Prenotazione appartenente a un altro flusso'; END IF;
    RETURN prior.reserved_at;
  END IF;
  slot := greatest(state.next_slot_at,p_now);
  used := CASE WHEN state.next_slot_at < p_now THEN 0 ELSE state.used_in_slot END;
  INSERT INTO migration_solaria.drip_reservations(queue_id,company_id,flow_id,node_id,reserved_at)
    VALUES(p_queue,p_company,p_flow,p_node,slot);
  used := used+1;
  UPDATE migration_solaria.drip_state
    SET next_slot_at=CASE WHEN used>=p_batch THEN slot+pg_catalog.make_interval(secs=>p_seconds) ELSE slot END,
        used_in_slot=CASE WHEN used>=p_batch THEN 0 ELSE used END
    WHERE company_id=p_company AND flow_id=p_flow AND node_id=p_node;
  RETURN slot;
END;
$$;
REVOKE ALL ON FUNCTION public.solaria_reserve_drip_slot(uuid,uuid,uuid,uuid,integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solaria_reserve_drip_slot(uuid,uuid,uuid,uuid,integer,integer,timestamptz) TO service_role;

-- Extra source events are emitted only for the migrated company. Existing
-- functions, triggers and tenants retain their current behaviour.
CREATE FUNCTION migration_solaria.emit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.company_id <> '3f52a5ed-0b4f-4f8f-8b92-a13f3361e474'::uuid THEN RETURN NEW; END IF;
  IF NEW.contact_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.marketing_contacts WHERE id=NEW.contact_id AND company_id=NEW.company_id) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='marketing_contact_notes' THEN
    INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
      VALUES(NEW.company_id,'note_added',NEW.contact_id::text,'contact',jsonb_build_object('note_id',NEW.id,'created_at',NEW.created_at));
  ELSIF TG_TABLE_NAME='marketing_opportunities' THEN
    IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
      (to_jsonb(OLD)-'updated_at'-'last_activity_at')=(to_jsonb(NEW)-'updated_at'-'last_activity_at') THEN RETURN NEW; END IF;
    INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
      VALUES(NEW.company_id,'opportunity_changed',NEW.contact_id::text,'contact',jsonb_build_object('opportunity_id',NEW.id,'pipeline_id',NEW.pipeline_id,'stage_id',NEW.stage_id,'status',NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION migration_solaria.emit_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER solaria_note_added AFTER INSERT ON public.marketing_contact_notes
  FOR EACH ROW EXECUTE FUNCTION migration_solaria.emit_event();
CREATE TRIGGER solaria_opportunity_changed AFTER UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION migration_solaria.emit_event();
