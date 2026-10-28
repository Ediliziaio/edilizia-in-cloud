-- Prepared locally, NOT applied. Keep outside supabase/migrations until coordinated rollout.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE SCHEMA IF NOT EXISTS automation_private;
REVOKE ALL ON SCHEMA automation_private FROM PUBLIC,anon,authenticated;

-- Trigger-only definer: it can append a scoped event, not modify business records.
CREATE OR REPLACE FUNCTION automation_private.custom_field_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row_data jsonb; old_value text; new_value text; co uuid; obj text; record_id uuid; def public.marketing_custom_fields%ROWTYPE; origin jsonb; key text;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_value:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.value END;
 new_value:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.value END;
 IF old_value IS NOT DISTINCT FROM new_value THEN RETURN NULL; END IF;
 SELECT * INTO def FROM public.marketing_custom_fields WHERE id=(row_data->>'field_id')::uuid AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF def.field_type IN ('number','currency','percent') AND old_value~'^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' AND new_value~'^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' THEN
  IF replace(old_value,',','.')::numeric=replace(new_value,',','.')::numeric THEN RETURN NULL; END IF;
 END IF;
 IF TG_TABLE_NAME='marketing_contact_field_values' THEN
  obj:='contact'; record_id:=(row_data->>'contact_id')::uuid; SELECT company_id INTO co FROM public.marketing_contacts WHERE id=record_id;
 ELSIF TG_TABLE_NAME='marketing_opportunity_field_values' THEN
  obj:='opportunity'; record_id:=(row_data->>'opportunity_id')::uuid; SELECT company_id INTO co FROM public.marketing_opportunities WHERE id=record_id;
 ELSE obj:=row_data->>'entity_type'; record_id:=(row_data->>'entity_id')::uuid; co:=(row_data->>'company_id')::uuid;
 END IF;
 IF co IS NULL OR co<>def.company_id THEN RETURN NULL; END IF;
 origin:=coalesce(nullif(current_setting('app.automation_custom_origin',true),'')::jsonb,'{}'::jsonb);
 key:='cf:'||TG_TABLE_NAME||':'||record_id||':'||def.id||':'||txid_current();
 INSERT INTO public.automation_trigger_events(company_id,trigger_event,entity_type,entity_id,payload,dedup_key)
 VALUES(co,'custom_field_updated',obj,record_id::text,jsonb_build_object('custom_field_id',def.id,'custom_object_type',def.object_type,'old_value',old_value,'new_value',new_value,'custom_field_flow_path',coalesce(origin->'flow_path','[]'::jsonb)),key)
 ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO UPDATE SET payload=automation_trigger_events.payload||jsonb_build_object('new_value',new_value);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION automation_private.custom_field_event() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS automation_custom_changed ON public.marketing_contact_field_values;
CREATE TRIGGER automation_custom_changed AFTER INSERT OR UPDATE OR DELETE ON public.marketing_contact_field_values FOR EACH ROW EXECUTE FUNCTION automation_private.custom_field_event();
DROP TRIGGER IF EXISTS automation_custom_changed ON public.marketing_opportunity_field_values;
CREATE TRIGGER automation_custom_changed AFTER INSERT OR UPDATE OR DELETE ON public.marketing_opportunity_field_values FOR EACH ROW EXECUTE FUNCTION automation_private.custom_field_event();
DROP TRIGGER IF EXISTS automation_custom_changed ON public.entity_custom_field_values;
CREATE TRIGGER automation_custom_changed AFTER INSERT OR UPDATE OR DELETE ON public.entity_custom_field_values FOR EACH ROW EXECUTE FUNCTION automation_private.custom_field_event();

CREATE OR REPLACE FUNCTION public.automation_write_custom_field(p_company uuid,p_entity_type text,p_entity_id uuid,p_field_id uuid,p_value text,p_enrollment_id uuid DEFAULT NULL,p_flow_path jsonb DEFAULT '[]') RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE co uuid; field_type text; enrollment public.automation_enrollments%ROWTYPE; path jsonb:=p_flow_path; previous_origin text;
BEGIN
 IF jsonb_typeof(path) IS DISTINCT FROM 'array' OR jsonb_array_length(path)>31 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(path) f WHERE f!~'^[a-f0-9-]{36}$') THEN RAISE EXCEPTION 'Catena automazioni non valida o troppo lunga'; END IF;
 IF p_enrollment_id IS NOT NULL THEN
  SELECT * INTO enrollment FROM public.automation_enrollments WHERE id=p_enrollment_id AND company_id=p_company AND status IN ('active','waiting');
  IF NOT FOUND THEN RAISE EXCEPTION 'Iscrizione non valida per questa azienda'; END IF;
  IF path ? enrollment.flow_id::text THEN RAISE EXCEPTION 'Ciclo di automazioni rilevato'; END IF;
  path:=path||jsonb_build_array(enrollment.flow_id::text);
 END IF;
 SELECT object_type INTO field_type FROM public.marketing_custom_fields WHERE id=p_field_id AND company_id=p_company AND deleted_at IS NULL;
 IF field_type IS NULL OR field_type<>(CASE WHEN p_entity_type LIKE 'quote_%' THEN 'quote' ELSE p_entity_type END) THEN RAISE EXCEPTION 'Campo non disponibile per questa azienda o oggetto'; END IF;
 previous_origin:=current_setting('app.automation_custom_origin',true);
 PERFORM set_config('app.automation_custom_origin',jsonb_build_object('flow_path',path)::text,true);
 IF p_entity_type='contact' THEN
  SELECT company_id INTO co FROM public.marketing_contacts WHERE id=p_entity_id AND deleted_at IS NULL;
  IF co IS DISTINCT FROM p_company THEN RAISE EXCEPTION 'Contatto non disponibile'; END IF;
  INSERT INTO public.marketing_contact_field_values(contact_id,field_id,value) VALUES(p_entity_id,p_field_id,p_value) ON CONFLICT(contact_id,field_id) DO UPDATE SET value=excluded.value;
 ELSIF p_entity_type='opportunity' THEN
  SELECT company_id INTO co FROM public.marketing_opportunities WHERE id=p_entity_id AND deleted_at IS NULL;
  IF co IS DISTINCT FROM p_company THEN RAISE EXCEPTION 'Opportunità non disponibile'; END IF;
  INSERT INTO public.marketing_opportunity_field_values(opportunity_id,field_id,value) VALUES(p_entity_id,p_field_id,p_value) ON CONFLICT(opportunity_id,field_id) DO UPDATE SET value=excluded.value;
 ELSE
  INSERT INTO public.entity_custom_field_values(company_id,entity_type,entity_id,field_id,value) VALUES(p_company,p_entity_type,p_entity_id,p_field_id,p_value) ON CONFLICT(entity_type,entity_id,field_id) DO UPDATE SET value=excluded.value;
 END IF;
 PERFORM set_config('app.automation_custom_origin',coalesce(previous_origin,''),true);
 RETURN p_field_id;
END $$;
REVOKE ALL ON FUNCTION public.automation_write_custom_field(uuid,text,uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_write_custom_field(uuid,text,uuid,uuid,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_custom_fields_version() RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.automation_custom_fields_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_custom_fields_version() TO service_role;

ALTER TABLE public.automation_enrollments DROP CONSTRAINT IF EXISTS automation_enrollments_entity_type_check;
ALTER TABLE public.automation_enrollments ADD CONSTRAINT automation_enrollments_entity_type_check CHECK(entity_type=ANY(ARRAY['contact','opportunity','appointment','order','invoice','payment','cost','quote','ticket','stock','warehouse','task','employee','leave_request','company','cron','manual','candidato','colloquio','stock_movement','manutenzione','contratto_manutenzione','ordini_variazione','giornale_lavori','duvri_document','quote_sr','quote_fv','quote_bgn','quote_rst','quote_tet','quote_clm','quote_idr','quote_ele','quote_pav','quote_pis']));
