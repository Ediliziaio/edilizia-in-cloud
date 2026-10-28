-- Additive rollout. Run the isolated PostgreSQL regression before applying.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.marketing_custom_fields ADD COLUMN IF NOT EXISTS key_aliases text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.cf_target(p_type text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
 SELECT CASE p_type
 WHEN 'appointment' THEN jsonb_build_array('appointments','can_view_calendar','can_view_calendar','appointment')
 WHEN 'task' THEN jsonb_build_array('tasks','can_view_marketing_activities','can_view_marketing_activities','task')
 WHEN 'employee' THEN jsonb_build_array('employees','can_view_settings_people','can_edit_settings_people','employee')
 WHEN 'warehouse' THEN jsonb_build_array('warehouse_stock','can_view_warehouse','can_edit_warehouse','warehouse')
 WHEN 'ordini_variazione' THEN jsonb_build_array('ordini_variazione','can_view_orders','can_edit_orders','ordini_variazione')
 WHEN 'giornale_lavori' THEN jsonb_build_array('giornale_lavori','can_view_giornale_lavori','can_edit_giornale_lavori','giornale_lavori')
 WHEN 'duvri_document' THEN jsonb_build_array('duvri_documents','can_view_sicurezza_cantiere','can_view_sicurezza_cantiere','duvri_document')
 WHEN 'order' THEN jsonb_build_array('orders','can_view_orders','can_edit_orders','order')
 WHEN 'quote' THEN jsonb_build_array('quotes','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_sr' THEN jsonb_build_array('sr_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_fv' THEN jsonb_build_array('fv_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_bgn' THEN jsonb_build_array('bgn_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_rst' THEN jsonb_build_array('rst_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_tet' THEN jsonb_build_array('tet_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_clm' THEN jsonb_build_array('clm_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_idr' THEN jsonb_build_array('idr_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_ele' THEN jsonb_build_array('ele_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_pav' THEN jsonb_build_array('pav_progetti','can_view_preventivi','can_edit_preventivi','quote')
 WHEN 'quote_pis' THEN jsonb_build_array('pis_progetti','can_view_preventivi','can_edit_preventivi','quote')
 ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.cf_target(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf_target(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cf_can_access(p_company uuid,p_type text,p_id uuid,p_write boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE target jsonb; ok boolean;
BEGIN
 target := public.cf_target(p_type);
 IF target IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
 IF p_write AND public.utente_sola_lettura(p_company) THEN RETURN false; END IF;
 IF NOT public.has_permission_for_company(auth.uid(),target->>(CASE WHEN p_write THEN 2 ELSE 1 END),p_company) THEN RETURN false; END IF;
 -- The parent record's own RLS (including assignment restrictions) still applies.
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE id=$1 AND company_id=$2 AND (NOT $3 OR coalesce(to_jsonb(r)->>''stato'',to_jsonb(r)->>''status'',''bozza'') NOT IN (''firmato'',''emesso'',''annullato'',''accettato'',''signed'',''accepted'')))',target->>0) INTO ok USING p_id,p_company,(p_write AND target->>3='quote');
 RETURN ok;
END $$;
REVOKE ALL ON FUNCTION public.cf_can_access(uuid,text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf_can_access(uuid,text,uuid,boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS company_access_entity_cfv ON public.entity_custom_field_values;
DROP POLICY IF EXISTS cf_read ON public.entity_custom_field_values;
DROP POLICY IF EXISTS cf_insert ON public.entity_custom_field_values;
DROP POLICY IF EXISTS cf_update ON public.entity_custom_field_values;
DROP POLICY IF EXISTS cf_delete ON public.entity_custom_field_values;
CREATE POLICY cf_read ON public.entity_custom_field_values FOR SELECT TO authenticated USING (public.cf_can_access(company_id,entity_type,entity_id,false));
CREATE POLICY cf_insert ON public.entity_custom_field_values FOR INSERT TO authenticated WITH CHECK (public.cf_can_access(company_id,entity_type,entity_id,true));
CREATE POLICY cf_update ON public.entity_custom_field_values FOR UPDATE TO authenticated USING (public.cf_can_access(company_id,entity_type,entity_id,true)) WITH CHECK (public.cf_can_access(company_id,entity_type,entity_id,true));
CREATE POLICY cf_delete ON public.entity_custom_field_values FOR DELETE TO authenticated USING (public.cf_can_access(company_id,entity_type,entity_id,true));

DROP POLICY IF EXISTS cf_module_definitions_read ON public.marketing_custom_fields;
CREATE POLICY cf_module_definitions_read ON public.marketing_custom_fields FOR SELECT TO authenticated USING (
 CASE WHEN object_type='quote' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_preventivi',company_id)
 WHEN object_type='employee' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_settings_people',company_id)
 WHEN object_type='warehouse' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_warehouse',company_id)
 WHEN object_type='appointment' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_calendar',company_id)
 WHEN object_type='task' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_marketing_activities',company_id)
 WHEN object_type='giornale_lavori' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_giornale_lavori',company_id)
 WHEN object_type='duvri_document' THEN public.has_permission_for_company((SELECT auth.uid()),'can_view_sicurezza_cantiere',company_id)
 ELSE false END);

CREATE OR REPLACE FUNCTION public.cf_validate_value() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE d public.marketing_custom_fields%ROWTYPE; co uuid; kind text; target jsonb; parent_company uuid; parent_state text; n numeric; v jsonb;
BEGIN
 IF TG_TABLE_NAME='marketing_contact_field_values' THEN
   kind := 'contact'; SELECT company_id INTO co FROM public.marketing_contacts WHERE id=NEW.contact_id;
 ELSIF TG_TABLE_NAME='marketing_opportunity_field_values' THEN
   kind := 'opportunity'; SELECT company_id INTO co FROM public.marketing_opportunities WHERE id=NEW.opportunity_id;
 ELSE
   co := NEW.company_id; target := public.cf_target(NEW.entity_type);
   IF target IS NULL THEN RAISE EXCEPTION 'Oggetto dei campi personalizzati non supportato' USING ERRCODE='23514'; END IF;
   kind := target->>3;
   EXECUTE format('SELECT company_id,coalesce(to_jsonb(r)->>''stato'',to_jsonb(r)->>''status'',''bozza'') FROM public.%I r WHERE id=$1',target->>0) INTO parent_company,parent_state USING NEW.entity_id;
   IF parent_company IS DISTINCT FROM co THEN RAISE EXCEPTION 'Record non disponibile per questa azienda' USING ERRCODE='23514'; END IF;
   IF kind='quote' AND parent_state IN ('firmato','emesso','annullato','accettato','signed','accepted') THEN RAISE EXCEPTION 'Documento consolidato: i campi aggiuntivi non sono modificabili' USING ERRCODE='23514'; END IF;
 END IF;
 IF co IS NULL THEN RAISE EXCEPTION 'Record non accessibile' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM public.marketing_custom_fields WHERE id=NEW.field_id AND company_id=co AND object_type=kind AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Definizione non attiva, oggetto o azienda non corrispondenti' USING ERRCODE='23514'; END IF;
 IF NEW.value IS NULL OR NEW.value='' THEN
   IF d.is_required THEN RAISE EXCEPTION 'Campo obbligatorio: %',d.name USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF length(NEW.value)>20000 THEN RAISE EXCEPTION 'Valore troppo lungo' USING ERRCODE='23514'; END IF;
 IF d.field_type IN ('number','currency','percent') THEN
   IF NEW.value !~ '^[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)$' THEN RAISE EXCEPTION 'Numero non valido' USING ERRCODE='23514'; END IF;
   n := replace(NEW.value,',','.')::numeric;
   IF d.field_type='percent' AND (n<0 OR n>100) THEN RAISE EXCEPTION 'Percentuale fuori intervallo' USING ERRCODE='23514'; END IF;
   NEW.value := n::text;
 ELSIF d.field_type='checkbox' AND NEW.value NOT IN ('true','false') THEN RAISE EXCEPTION 'Booleano non valido' USING ERRCODE='23514';
 ELSIF d.field_type='date' THEN
   IF NEW.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(NEW.value::date,'YYYY-MM-DD')<>NEW.value THEN RAISE EXCEPTION 'Data non valida' USING ERRCODE='23514'; END IF;
 ELSIF d.field_type='time' AND NEW.value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ora non valida' USING ERRCODE='23514';
 ELSIF d.field_type='email' AND NEW.value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Email non valida' USING ERRCODE='23514';
 ELSIF d.field_type='url' AND NEW.value !~* '^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'Indirizzo web non valido' USING ERRCODE='23514';
 ELSIF d.field_type IN ('select','radio') AND NOT (NEW.value=ANY(coalesce(d.options,'{}'))) THEN RAISE EXCEPTION 'Scelta non prevista' USING ERRCODE='23514';
 ELSIF d.field_type='multiselect' THEN
   v := NEW.value::jsonb;
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Serve un elenco di scelte' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(v)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e)<>'string' OR NOT ((e#>>'{}')=ANY(coalesce(d.options,'{}')))) THEN RAISE EXCEPTION 'Scelta multipla non valida' USING ERRCODE='23514'; END IF;
 ELSIF d.field_type='file' THEN RAISE EXCEPTION 'Gli allegati si gestiscono in Documenti' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_validate_value() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS cf_validate ON public.entity_custom_field_values;
CREATE TRIGGER cf_validate BEFORE INSERT OR UPDATE ON public.entity_custom_field_values FOR EACH ROW EXECUTE FUNCTION public.cf_validate_value();
DROP TRIGGER IF EXISTS cf_validate ON public.marketing_contact_field_values;
CREATE TRIGGER cf_validate BEFORE INSERT OR UPDATE ON public.marketing_contact_field_values FOR EACH ROW EXECUTE FUNCTION public.cf_validate_value();
DROP TRIGGER IF EXISTS cf_validate ON public.marketing_opportunity_field_values;
CREATE TRIGGER cf_validate BEFORE INSERT OR UPDATE ON public.marketing_opportunity_field_values FOR EACH ROW EXECUTE FUNCTION public.cf_validate_value();

CREATE OR REPLACE FUNCTION public.cf_keep_aliases() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE old_key text; new_key text; aliases text[];
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id) THEN RAISE EXCEPTION 'Identità del campo immutabile' USING ERRCODE='23514'; END IF;
 new_key := trim(both '_' from regexp_replace(lower(NEW.name),'[^a-z0-9]+','_','g'));
 IF new_key='' THEN RAISE EXCEPTION 'Il nome deve contenere lettere o numeri' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text||':'||NEW.object_type,0));
 aliases := CASE WHEN TG_OP='UPDATE' THEN OLD.key_aliases ELSE '{}'::text[] END;
 IF TG_OP='UPDATE' THEN
   old_key := trim(both '_' from regexp_replace(lower(OLD.name),'[^a-z0-9]+','_','g'));
   IF old_key<>new_key THEN aliases := array_append(aliases,old_key); END IF;
   IF NEW.object_type<>OLD.object_type AND (EXISTS(SELECT 1 FROM public.marketing_contact_field_values WHERE field_id=OLD.id) OR EXISTS(SELECT 1 FROM public.marketing_opportunity_field_values WHERE field_id=OLD.id) OR EXISTS(SELECT 1 FROM public.entity_custom_field_values WHERE field_id=OLD.id)) THEN RAISE EXCEPTION 'Un campo valorizzato non può cambiare oggetto' USING ERRCODE='23514'; END IF;
   IF (NEW.field_type<>OLD.field_type OR NEW.options IS DISTINCT FROM OLD.options) AND (EXISTS(SELECT 1 FROM public.marketing_contact_field_values WHERE field_id=OLD.id) OR EXISTS(SELECT 1 FROM public.marketing_opportunity_field_values WHERE field_id=OLD.id) OR EXISTS(SELECT 1 FROM public.entity_custom_field_values WHERE field_id=OLD.id)) THEN RAISE EXCEPTION 'Un campo valorizzato non può cambiare tipo o opzioni' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.key_aliases := ARRAY(SELECT DISTINCT a FROM unnest(aliases) a WHERE a<>'' AND a<>new_key ORDER BY a);
 IF NEW.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.marketing_custom_fields f WHERE f.company_id=NEW.company_id AND f.object_type=NEW.object_type AND f.id<>NEW.id AND f.deleted_at IS NULL AND (new_key=trim(both '_' from regexp_replace(lower(f.name),'[^a-z0-9]+','_','g')) OR new_key=ANY(f.key_aliases) OR trim(both '_' from regexp_replace(lower(f.name),'[^a-z0-9]+','_','g'))=ANY(NEW.key_aliases) OR f.key_aliases && NEW.key_aliases)) THEN RAISE EXCEPTION 'Nome o alias già utilizzato da un altro campo' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cf_keep_aliases() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS cf_aliases ON public.marketing_custom_fields;
CREATE TRIGGER cf_aliases BEFORE INSERT OR UPDATE ON public.marketing_custom_fields FOR EACH ROW EXECUTE FUNCTION public.cf_keep_aliases();
