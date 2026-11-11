-- Worker-only atomic custom-field writes. Existing cf_validate_value validates
-- type, active definition, company, parent record and consolidated documents.
set local lock_timeout='3s';
set local statement_timeout='60s';
-- Correct the existing validator's overescaped email dot; all other checks remain.
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
 IF auth.uid() IS NOT NULL AND public.utente_sola_lettura(co) THEN RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE='42501'; END IF;
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
 ELSIF d.field_type='email' AND NEW.value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Email non valida' USING ERRCODE='23514';
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

revoke all on function public.cf_validate_value() from public,anon,authenticated;

create or replace function public.automation_write_custom_field(
 p_company uuid,p_entity_type text,p_entity_id uuid,p_field_id uuid,p_value text,
 p_enrollment_id uuid default null,p_flow_path jsonb default '[]'
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare target jsonb; co uuid; kind text; path jsonb:=coalesce(p_flow_path,'[]'); fid uuid; previous_path text;
begin
 if jsonb_typeof(path)<>'array' or jsonb_array_length(path)>31 or exists(select 1 from jsonb_array_elements(path) e where jsonb_typeof(e)<>'string' or (e#>>'{}') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') then raise exception 'Catena automazioni non valida'; end if;
 if p_entity_type in ('contact','opportunity') then
  kind:=p_entity_type;
  execute format('select company_id from public.%I where id=$1',case when kind='contact' then 'marketing_contacts' else 'marketing_opportunities' end) into co using p_entity_id;
 else
  target:=public.cf_target(p_entity_type);
  if target is null then raise exception 'Oggetto non supportato'; end if;
  kind:=target->>3;
  execute format('select company_id from public.%I where id=$1',target->>0) into co using p_entity_id;
 end if;
 if co is distinct from p_company or not exists(select 1 from public.marketing_custom_fields where id=p_field_id and company_id=p_company and object_type=kind and deleted_at is null) then raise exception 'Record o campo non disponibile per questa azienda'; end if;
 if p_enrollment_id is not null then
  select flow_id into fid from public.automation_enrollments where id=p_enrollment_id and company_id=p_company;
  if not found then raise exception 'Iscrizione non valida'; end if;
  if not path @> jsonb_build_array(fid::text) then path:=path||jsonb_build_array(fid::text); end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_entity_type||p_entity_id::text||p_field_id::text,0));
 previous_path:=current_setting('app.automation_custom_field_path',true);
 perform set_config('app.automation_custom_field_path',path::text,true);
 if kind='contact' then
  insert into public.marketing_contact_field_values(contact_id,field_id,value) values(p_entity_id,p_field_id,p_value)
   on conflict(contact_id,field_id) do update set value=excluded.value where marketing_contact_field_values.value is distinct from excluded.value;
 elsif kind='opportunity' then
  insert into public.marketing_opportunity_field_values(opportunity_id,field_id,value) values(p_entity_id,p_field_id,p_value)
   on conflict(opportunity_id,field_id) do update set value=excluded.value where marketing_opportunity_field_values.value is distinct from excluded.value;
 else
  insert into public.entity_custom_field_values(company_id,entity_type,entity_id,field_id,value) values(p_company,p_entity_type,p_entity_id,p_field_id,p_value)
   on conflict(entity_type,entity_id,field_id) do update set value=excluded.value where entity_custom_field_values.value is distinct from excluded.value;
 end if;
 perform set_config('app.automation_custom_field_path',coalesce(previous_path,''),true);
 return p_field_id;
end $$;
revoke all on function public.automation_write_custom_field(uuid,text,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.automation_write_custom_field(uuid,text,uuid,uuid,text,uuid,jsonb) to service_role;

create or replace function public.automation_custom_field_changed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare co uuid; eid uuid; et text; kind text; nv text; ov text; field uuid; path jsonb;
begin
 if tg_op='UPDATE' and new.value is not distinct from old.value then return new; end if;
 if tg_op='DELETE' then field:=old.field_id; ov:=old.value; else field:=new.field_id; nv:=new.value; if tg_op='UPDATE' then ov:=old.value; end if; end if;
 if tg_table_name='marketing_contact_field_values' then
  eid:=case when tg_op='DELETE' then old.contact_id else new.contact_id end; et:='contact';
  select company_id into co from public.marketing_contacts where id=eid;
 elsif tg_table_name='marketing_opportunity_field_values' then
  eid:=case when tg_op='DELETE' then old.opportunity_id else new.opportunity_id end; et:='opportunity';
  select company_id into co from public.marketing_opportunities where id=eid;
 else
  if tg_op='DELETE' then co:=old.company_id; eid:=old.entity_id; et:=old.entity_type; else co:=new.company_id; eid:=new.entity_id; et:=new.entity_type; end if;
 end if;
 select object_type into kind from public.marketing_custom_fields where id=field and company_id=co and deleted_at is null;
 if co is not null and kind is not null and ov is distinct from nv then
  path:=coalesce(nullif(current_setting('app.automation_custom_field_path',true),'')::jsonb,'[]');
  insert into public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload)
   values(co,'custom_field_updated',eid::text,et,jsonb_build_object('custom_field_id',field,'custom_object_type',kind,'old_value',ov,'new_value',nv,'custom_field_flow_path',path));
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.automation_custom_field_changed() from public,anon,authenticated;
do $$declare t text; begin
 foreach t in array array['marketing_contact_field_values','marketing_opportunity_field_values','entity_custom_field_values'] loop
  execute format('drop trigger if exists automation_custom_field_changed on public.%I',t);
  execute format('create trigger automation_custom_field_changed after insert or update or delete on public.%I for each row execute function public.automation_custom_field_changed()',t);
 end loop;
end $$;
-- Preserve the existing accepted entities while admitting all custom-field objects.
do $$declare rule text; begin
 select pg_get_expr(conbin,conrelid) into rule from pg_constraint where conrelid='public.automation_enrollments'::regclass and conname='automation_enrollments_entity_type_check';
 if rule is not null then
  alter table public.automation_enrollments drop constraint automation_enrollments_entity_type_check;
  execute 'alter table public.automation_enrollments add constraint automation_enrollments_entity_type_check check (('||rule||') or entity_type in (''warehouse'',''ordini_variazione'',''giornale_lavori'',''duvri_document'',''quote_sr'',''quote_fv'',''quote_bgn'',''quote_rst'',''quote_tet'',''quote_clm'',''quote_idr'',''quote_ele'',''quote_pav'',''quote_pis''))';
 end if;
end $$;
create or replace function public.automation_custom_fields_version() returns integer language sql stable security invoker set search_path=public,pg_temp as $$select 1$$;
revoke all on function public.automation_custom_fields_version() from public,anon,authenticated;
grant execute on function public.automation_custom_fields_version() to service_role;
