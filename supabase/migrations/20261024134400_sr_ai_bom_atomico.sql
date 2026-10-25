-- Conversational BOM import. Invoker privileges + existing RLS.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create or replace function public.sr_apply_ai_bom_atomic(
 p_project_id uuid, p_company_id uuid, p_expected_project jsonb,
 p_expected jsonb, p_next jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 project record; entry record; row_data jsonb; current_rows jsonb;
 wanted jsonb; expected_rows jsonb; replay boolean:=true; conflict boolean:=false;
 columns_sql text; updates_sql text; affected integer; row_count integer;
begin
 if auth.uid() is null or public.get_effective_company_id() is distinct from p_company_id then
   raise exception 'Azienda non autorizzata' using errcode='42501';
 end if;
 if (public.has_permission_for_company(auth.uid(),'can_edit_marketing_opportunities',p_company_id)
   or public.has_permission_for_company(auth.uid(),'can_edit_marketing',p_company_id)) is not true then
   raise exception 'Modifica non autorizzata' using errcode='42501';
 end if;
 select * into project from public.sr_progetti where id=p_project_id and company_id=p_company_id for update;
 if not found or project.stato::text is distinct from 'bozza' then raise exception 'Preventivo non modificabile' using errcode='42501'; end if;
 perform 1 from public.sr_serramenti_progetto where progetto_id=p_project_id and company_id=p_company_id order by id for update;
 perform 1 from public.sr_accessori_progetto where progetto_id=p_project_id and company_id=p_company_id order by id for update;
 perform 1 from public.sr_servizi_progetto where progetto_id=p_project_id and company_id=p_company_id order by id for update;
 if to_jsonb(project) is distinct from (select to_jsonb(p) from jsonb_populate_record(null::public.sr_progetti,p_expected_project) p) then raise exception 'Preventivo cambiato: riapri la chat' using errcode='40001'; end if;
 if jsonb_typeof(p_next) <> 'object' or jsonb_typeof(p_expected) <> 'object'
   or (select count(*) from jsonb_object_keys(p_next))<>3
   or pg_catalog.octet_length(p_next::text)>1500000 then raise exception 'BOM non valido'; end if;
 for entry in select * from (values ('serramenti','sr_serramenti_progetto'),('accessori','sr_accessori_progetto'),('servizi','sr_servizi_progetto')) as t(key,tbl) loop
   wanted:=p_next->entry.key; expected_rows:=p_expected->entry.key;
   if jsonb_typeof(wanted) is distinct from 'array' or jsonb_array_length(wanted)>100 or jsonb_typeof(expected_rows) is distinct from 'array' then raise exception 'Righe non valide'; end if;
   select count(distinct v->>'id'),count(*) into affected,row_count from jsonb_array_elements(wanted) v;
   if affected<>row_count then raise exception 'Identità duplicate'; end if;
   for row_data in select value from jsonb_array_elements(wanted) loop
     -- Preserve untouched legacy/incomplete draft rows without repricing them.
     -- The expected BOM is still checked against the locked actual rows below.
     if exists(select 1 from jsonb_array_elements(expected_rows) v where v->>'id'=row_data->>'id' and v-'created_at'-'updated_at'=row_data-'created_at'-'updated_at') then continue; end if;
     if (row_data->>'progetto_id')::uuid is distinct from p_project_id or (row_data->>'company_id')::uuid is distinct from p_company_id
       or row_data->>'id' is null or not coalesce((row_data->>'quantita')::numeric>0 and (row_data->>'quantita')::numeric<=1000000,false) then raise exception 'Riga di un altro preventivo o quantità non valida'; end if;
     if exists(select 1 from jsonb_object_keys(row_data) k where not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.'||entry.tbl) and a.attname=k and a.attnum>0 and not a.attisdropped)) then raise exception 'Colonna non consentita'; end if;
     if entry.key<>'servizi' and trunc((row_data->>'quantita')::numeric)<>(row_data->>'quantita')::numeric then raise exception 'I prodotti richiedono quantità intere'; end if;
     if entry.key='servizi' then
       if not coalesce((row_data->>'prezzo_unitario_vendita')::numeric between 0 and 10000000,false)
          or (row_data->>'prezzo_totale_vendita')::numeric is distinct from round((row_data->>'quantita')::numeric*(row_data->>'prezzo_unitario_vendita')::numeric,2) then raise exception 'Prezzo servizio non valido'; end if;
     else
       if not coalesce((row_data->>'prezzo_unitario')::numeric between 0 and 10000000,false)
          or (row_data->>'prezzo_totale')::numeric is distinct from round((row_data->>'quantita')::numeric*(row_data->>'prezzo_unitario')::numeric,2) then raise exception 'Prezzo prodotto non valido'; end if;
       if row_data->>'family_id' is not null and not exists(select 1 from public.article_families where id=(row_data->>'family_id')::uuid and company_id=p_company_id) then raise exception 'Famiglia non disponibile'; end if;
     end if;
   end loop;
   execute format('select coalesce(jsonb_agg(to_jsonb(r)-''created_at''-''updated_at'' order by id),''[]''::jsonb) from public.%I r where progetto_id=$1 and company_id=$2',entry.tbl) into current_rows using p_project_id,p_company_id;
   select coalesce(jsonb_agg(v-'created_at'-'updated_at' order by v->>'id'),'[]'::jsonb) into wanted from jsonb_array_elements(wanted) v;
   select coalesce(jsonb_agg(v-'created_at'-'updated_at' order by v->>'id'),'[]'::jsonb) into expected_rows from jsonb_array_elements(expected_rows) v;
   replay:=replay and current_rows=wanted;
   conflict:=conflict or current_rows<>expected_rows;
 end loop;
 if replay then return jsonb_build_object('projectId',p_project_id,'replayed',true); end if;
 if conflict then raise exception 'Distinta modificata altrove: riapri la chat' using errcode='40001'; end if;
 if exists(select 1 from jsonb_array_elements(p_next->'accessori') a where a->>'serramento_id' is not null and not exists(select 1 from jsonb_array_elements(p_next->'serramenti') s where s->>'id'=a->>'serramento_id')) then raise exception 'Accessorio senza serramento'; end if;
 -- Children first for removals; retained IDs (and their photos) are never replaced.
 delete from public.sr_accessori_progetto where progetto_id=p_project_id and company_id=p_company_id and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_next->'accessori') v);
 delete from public.sr_servizi_progetto where progetto_id=p_project_id and company_id=p_company_id and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_next->'servizi') v);
 for entry in select * from (values ('serramenti','sr_serramenti_progetto'),('accessori','sr_accessori_progetto'),('servizi','sr_servizi_progetto')) as t(key,tbl) loop
   select string_agg(format('%I',a.attname),',' order by a.attnum),
     string_agg(format('%1$I=excluded.%1$I',a.attname),',' order by a.attnum) filter(where a.attname not in('id','progetto_id','company_id','created_at','updated_at'))
     into columns_sql,updates_sql from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.'||entry.tbl) and a.attnum>0 and not a.attisdropped and a.attgenerated='';
   for row_data in select value from jsonb_array_elements(p_next->entry.key) loop
     execute format('insert into public.%1$I as target (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) on conflict(id) do update set %3$s where target.progetto_id=$2 and target.company_id=$3',entry.tbl,columns_sql,updates_sql) using row_data,p_project_id,p_company_id;
     get diagnostics affected=row_count;
     if affected<>1 then raise exception 'Identità appartenente a un altro preventivo' using errcode='42501'; end if;
   end loop;
 end loop;
 delete from public.sr_serramenti_progetto where progetto_id=p_project_id and company_id=p_company_id and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_next->'serramenti') v);
 -- DELETE policies can silently filter rows rather than raise. Verify the
 -- complete postcondition, so a policy-denied removal rolls everything back.
 for entry in select * from (values ('serramenti','sr_serramenti_progetto'),('accessori','sr_accessori_progetto'),('servizi','sr_servizi_progetto')) as t(key,tbl) loop
   execute format('select coalesce(jsonb_agg(to_jsonb(r)-''created_at''-''updated_at'' order by id),''[]''::jsonb) from public.%I r where progetto_id=$1 and company_id=$2',entry.tbl) into current_rows using p_project_id,p_company_id;
   execute format('select coalesce(jsonb_agg(to_jsonb(r)-''created_at''-''updated_at'' order by id),''[]''::jsonb) from jsonb_populate_recordset(null::public.%I,$1) r',entry.tbl) into wanted using p_next->entry.key;
   if current_rows is distinct from wanted then raise exception 'Applicazione completa negata: nessuna modifica salvata' using errcode='42501'; end if;
 end loop;
 return jsonb_build_object('projectId',p_project_id,'replayed',false);
end $$;
revoke all on function public.sr_apply_ai_bom_atomic(uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.sr_apply_ai_bom_atomic(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;
