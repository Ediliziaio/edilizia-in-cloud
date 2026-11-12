-- Protezione permessi: letture con proiezione economica, aggregati e collaboratori.
set local lock_timeout='3s';
set local statement_timeout='60s';
set local search_path='';
create schema if not exists private;
grant usage on schema private to authenticated,service_role;
alter table public.staff_permissions add column if not exists can_view_order_payment_status boolean not null default false;

-- Preserve the effective pre-existing row policies; the financial restriction is
-- additional, never a replacement for tenant, assignment, portal or blocked-user rules.
do $build$
declare predicate text;
begin
 select '('||coalesce(string_agg('('||coalesce(pg_get_expr(polqual,polrelid),'true')||')',' OR ') filter(where polpermissive),'false')||') AND ('||coalesce(string_agg('('||coalesce(pg_get_expr(polqual,polrelid),'true')||')',' AND ') filter(where not polpermissive),'true')||')'
 into predicate from pg_policy where polrelid='public.orders'::regclass and polcmd in ('r','*') and polname not like 'office_%'
 and (0=any(polroles) or 'authenticated'::regrole::oid=any(polroles));
 execute format($f$create or replace function private.office_visible_order(p_id uuid) returns boolean language sql stable security definer set search_path='' as $body$ select auth.uid() is not null and exists(select 1 from public.orders as orders where orders.id=p_id and (%s)) $body$$f$,predicate);
end $build$;
revoke all on function private.office_visible_order(uuid) from public,anon;
grant execute on function private.office_visible_order(uuid) to authenticated,service_role;

create or replace function private.office_company_rights(p_company uuid)
returns jsonb language sql stable security definer set search_path=''
as $f$
 select jsonb_build_object('amounts',a,'costs',c,'margins',m,'personal',c and h,'payments',a or s)
 from (select
  (coalesce(public.has_permission_for_company(auth.uid(),'can_view_order_amounts',p_company),false) or public.user_can_read_accountant_company(p_company)) a,
  coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false) or coalesce(public.has_permission_for_company(auth.uid(),'can_manage_purchasing',p_company),false) or public.user_can_read_accountant_company(p_company) c,
  (coalesce(public.has_permission_for_company(auth.uid(),'can_view_margins',p_company),false) or public.user_can_read_accountant_company(p_company)) m,
  coalesce(public.has_permission_for_company(auth.uid(),'can_view_employees',p_company),false) or coalesce(public.has_permission_for_company(auth.uid(),'can_view_persone',p_company),false) or public.user_can_read_accountant_company(p_company) h,
  coalesce(public.has_permission_for_company(auth.uid(),'can_view_order_payment_status',p_company),false) s
 where auth.uid() is not null and not public.utente_bloccato() and public.user_can_access_company(p_company)) x
$f$;
create or replace function private.office_order_rights(p_order uuid)
returns jsonb language sql stable security definer set search_path=''
as $f$
 select case when public.utente_e_cliente_esterno()
 then jsonb_build_object('amounts',true,'payments',true,'costs',false,'margins',false,'personal',false)
 else coalesce(private.office_company_rights(o.company_id),'{}'::jsonb) end
 from public.orders o where o.id=p_order and private.office_visible_order(o.id)
$f$;
revoke all on function private.office_company_rights(uuid),private.office_order_rights(uuid) from public,anon;
grant execute on function private.office_company_rights(uuid),private.office_order_rights(uuid) to authenticated,service_role;

-- Generic write checks evaluate the ORIGINAL policies against the actual old/new
-- row. They are private and callable only by the projection triggers.
create or replace function private.office_write_allowed(p_table text,p_command text,p_row jsonb,p_check boolean)
returns boolean language plpgsql stable security definer set search_path=''
as $f$
declare predicate text; answer boolean; cmd "char";
begin
 if auth.uid() is null or public.utente_bloccato() or p_table not in ('orders','order_installments','order_employees','campo_rapportini') then return false; end if;
 cmd:=case p_command when 'INSERT' then 'a' when 'UPDATE' then 'w' when 'DELETE' then 'd' else '?' end;
 select '('||coalesce(string_agg('('||coalesce(case when p_check then pg_get_expr(coalesce(polwithcheck,polqual),polrelid) else pg_get_expr(polqual,polrelid) end,'true')||')',' OR ') filter(where polpermissive),'false')||') AND ('||coalesce(string_agg('('||coalesce(case when p_check then pg_get_expr(coalesce(polwithcheck,polqual),polrelid) else pg_get_expr(polqual,polrelid) end,'true')||')',' AND ') filter(where not polpermissive),'true')||')'
 into predicate from pg_policy where polrelid=format('public.%I',p_table)::regclass and polcmd in (cmd,'*') and polname not like 'office_%'
 and (0=any(polroles) or 'authenticated'::regrole::oid=any(polroles));
 execute format('select (%s) from jsonb_populate_record(null::public.%I,$1) as %I',predicate,p_table,p_table) into answer using p_row;
 return coalesce(answer,false);
end $f$;
revoke all on function private.office_write_allowed(text,text,jsonb,boolean) from public,anon,authenticated;

create table if not exists private.office_projection_fields(
 table_name text not null,column_name text not null,right_name text not null,
 primary key(table_name,column_name));
revoke all on private.office_projection_fields from public,anon,authenticated;
insert into private.office_projection_fields values
 ('orders','total_amount','amounts'),('orders','deposit_amount','amounts'),('orders','deposit_2_amount','amounts'),('orders','balance_amount','amounts'),('orders','financing_amount','amounts'),('orders','vat_rate','amounts'),('orders','payment_type','amounts'),('orders','tetto_importo','amounts'),
 ('orders','financing_cost','costs'),('orders','financing_cost_mode','costs'),
 ('orders','deposit_paid','payments'),('orders','deposit_paid_date','payments'),('orders','deposit_2_paid','payments'),('orders','deposit_2_paid_date','payments'),('orders','balance_paid','payments'),('orders','balance_paid_date','payments'),('orders','financing_paid','payments'),('orders','financing_paid_date','payments'),
 ('order_installments','is_paid','payments'),('order_installments','paid_date','payments'),('order_installments','label','amounts'),('order_installments','amount','amounts'),('order_installments','invoice_id','amounts'),('order_installments','documento_fiscale_id','amounts'),
 ('order_employees','notes','personal'),('order_employees','hourly_rate','personal'),('order_employees','planned_hourly_rate','personal'),('order_employees','total_cost','personal'),('order_employees','cost_preventivo','personal'),('order_employees','is_paid','personal'),('order_employees','paid_date','personal')
on conflict(table_name,column_name) do update set right_name=excluded.right_name;

-- The security-definer projections explicitly enforce the original row policies.
-- Clients cannot select the unmasked rows without the relevant economic rights.
do $views$
declare t text; cols text; predicate text; d record;
begin
 foreach t in array array['orders','order_installments','order_employees'] loop
  if t='orders' then predicate:='private.office_visible_order(orders.id)';
  else
   select '('||coalesce(string_agg('('||coalesce(pg_get_expr(polqual,polrelid),'true')||')',' OR ') filter(where polpermissive),'false')||') AND ('||coalesce(string_agg('('||coalesce(pg_get_expr(polqual,polrelid),'true')||')',' AND ') filter(where not polpermissive),'true')||')'
   into predicate from pg_policy where polrelid=format('public.%I',t)::regclass and polcmd in ('r','*') and polname not like 'office_%' and polname<>'costi_solo_con_permesso'
   and (0=any(polroles) or 'authenticated'::regrole::oid=any(polroles));
   predicate:='('||predicate||') AND private.office_visible_order('||quote_ident(t)||'.order_id)';
   if t='order_installments' then predicate:=predicate||' AND coalesce((r.rights->>''payments'')::boolean,false)'; end if;
  end if;
  select string_agg(case when f.column_name is null then format('%I.%I',t,a.attname)
    else format('case when coalesce((r.rights->>%L)::boolean,false) then %I.%I else null::%s end as %I',f.right_name,t,a.attname,format_type(a.atttypid,a.atttypmod),a.attname) end,',' order by a.attnum)
  into cols from pg_attribute a left join private.office_projection_fields f on f.table_name=t and f.column_name=a.attname
  where a.attrelid=format('public.%I',t)::regclass and a.attnum>0 and not a.attisdropped;
  execute format('create or replace view public.%I with(security_barrier=true) as select %s from public.%I %I cross join lateral (select private.office_order_rights(%I.%I) as rights offset 0) r where %s',t||'_visibili',cols,t,t,t,case when t='orders' then 'id' else 'order_id' end,predicate);
  execute format('revoke all on public.%I from public,anon',t||'_visibili');
  execute format('grant select,insert,update,delete on public.%I to authenticated',t||'_visibili');
  for d in select a.attname,pg_get_expr(ad.adbin,ad.adrelid) expr from pg_attribute a join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid=format('public.%I',t)::regclass loop
   execute format('alter view public.%I alter column %I set default %s',t||'_visibili',d.attname,d.expr);
  end loop;
 end loop;
end $views$;

create or replace function private.office_projection_write()
returns trigger language plpgsql security definer set search_path=''
as $f$
declare t text:=replace(tg_table_name,'_visibili',''); before_row jsonb; changed jsonb:='{}'; result jsonb; rights jsonb; key text; val jsonb; order_id uuid; company_id uuid; cols text; sets text; protected record;
begin
 if t not in ('orders','order_installments','order_employees','campo_rapportini') or auth.uid() is null then raise exception 'Operazione non consentita' using errcode='42501'; end if;
 if tg_op<>'INSERT' then
  execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into before_row using old.id;
  if before_row is null or not private.office_write_allowed(t,tg_op,before_row,false) then raise exception 'Operazione non consentita' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then execute format('delete from public.%I where id=$1',t) using old.id; return old; end if;
 order_id:=case when t='orders' then new.id else (to_jsonb(new)->>'order_id')::uuid end;
 if tg_op='INSERT' and t='orders' then rights:=private.office_company_rights((to_jsonb(new)->>'company_id')::uuid); else rights:=private.office_order_rights(order_id); end if;
 for key,val in select * from jsonb_each(to_jsonb(new)) loop
  if tg_op='INSERT' then if val<>'null'::jsonb then changed:=changed||jsonb_build_object(key,val); end if;
  elsif val is distinct from (to_jsonb(old)->key) then changed:=changed||jsonb_build_object(key,val); end if;
 end loop;
 if tg_op='UPDATE' and (changed ? 'id' or changed ? 'company_id' or changed ? 'order_id' or changed ? 'employee_id') then raise exception 'Identità della riga non modificabile' using errcode='42501'; end if;
 for protected in select * from private.office_projection_fields where table_name=t loop
  if not coalesce((rights->>protected.right_name)::boolean,false) or (protected.right_name='payments' and not coalesce((rights->>'amounts')::boolean,false)) then changed:=changed-protected.column_name; end if;
 end loop;
 if tg_op='INSERT' then
  select string_agg(format('%I',k),',') into cols from jsonb_object_keys(changed) k;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',t,cols,cols,t,t) into result using changed;
 else
  if changed='{}'::jsonb then result:=before_row;
  else
   select string_agg(format('%I=v.%I',k,k),',') into sets from jsonb_object_keys(changed) k;
   execute format('update public.%I as target set %s from jsonb_populate_record(null::public.%I,$1) v where target.id=$2 returning to_jsonb(target.*)',t,sets,t) into result using before_row||changed,old.id;
  end if;
 end if;
 if not private.office_write_allowed(t,tg_op,result,true) then raise exception 'Operazione non consentita' using errcode='42501'; end if;
 execute format('select * from public.%I where id=$1',tg_table_name) into new using (result->>'id')::uuid;
 return new;
end $f$;
revoke all on function private.office_projection_write() from public,anon,authenticated;
do $triggers$
declare t text;
begin foreach t in array array['orders','order_installments','order_employees'] loop
 execute format('drop trigger if exists office_projection_write on public.%I',t||'_visibili');
 execute format('create trigger office_projection_write instead of insert or update or delete on public.%I for each row execute function private.office_projection_write()',t||'_visibili');
end loop;end $triggers$;

-- No request-method/path exceptions: raw reads, embeddings and INSERT RETURNING
-- are protected by PostgreSQL too. Internal definers continue calculating costs.
drop policy if exists office_financial_select on public.orders;
create policy office_financial_select on public.orders as restrictive for select to authenticated
 using(coalesce((private.office_company_rights(company_id)->>'amounts')::boolean,false) and coalesce((private.office_company_rights(company_id)->>'costs')::boolean,false) and coalesce((private.office_company_rights(company_id)->>'margins')::boolean,false));
drop policy if exists office_financial_select on public.order_installments;
create policy office_financial_select on public.order_installments as restrictive for select to authenticated
 using(coalesce((private.office_order_rights(order_id)->>'amounts')::boolean,false));
drop policy if exists office_financial_select on public.order_employees;
create policy office_financial_select on public.order_employees as restrictive for select to authenticated
 using(coalesce((private.office_order_rights(order_id)->>'personal')::boolean,false));

-- Rebind the pre-existing price-free views: their parent order checks must use
-- the same row visibility, not require access to the raw financial parent.
do $rebind$
declare v record; body text;
begin
 for v in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and c.relname like '%_senza_prezzi' loop
  body:=pg_get_viewdef(format('public.%I',v.relname)::regclass,true);
  body:=regexp_replace(body,'\m(FROM|JOIN)\s+(public\.)?orders\M','\1 public.orders_visibili','gi');
  execute format('create or replace view public.%I with(security_barrier=true,security_invoker=true) as %s',v.relname,body);
 end loop;
end $rebind$;

create or replace function public.commessa_costo_personale_aggregato(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare rights jsonb:=private.office_order_rights(p_order_id); result jsonb;
begin
 if not coalesce((rights->>'costs')::boolean,false) then raise exception 'Costi non consentiti' using errcode='42501'; end if;
 select jsonb_build_object('cost',coalesce(sum(total_cost),0),'budget',sum(cost_preventivo),'unpriced',count(*) filter(where hours_worked>0 and coalesce(total_cost,0)=0)>0)
 into result from public.order_employees where order_id=p_order_id;
 return result;
end $f$;
revoke all on function public.commessa_costo_personale_aggregato(uuid) from public,anon;
grant execute on function public.commessa_costo_personale_aggregato(uuid) to authenticated;

-- Collaborative office membership never grants financial or HR permissions.
-- Full calculations stay private; the public canonical account projects each
-- class of values independently, without losing hidden labor costs in totals.
do $canonical$
declare body text; cols text;
begin
 if to_regclass('private.office_order_economics_base') is null then
  body:=pg_get_viewdef('public.v_ordine_marginalita'::regclass,true);
  execute 'create view private.office_order_economics_base as '||body;
 end if;
 revoke all on private.office_order_economics_base from public,anon,authenticated,service_role;
 select string_agg(case
  when a.attname in ('preventivo_contratto','variazioni_approvate','preventivo_totale') then format('(case when coalesce((r.rights->>''amounts'')::boolean,false) then b.%I end)::%s as %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname)
  when a.attname in ('margine','margine_perc') then format('(case when coalesce((r.rights->>''margins'')::boolean,false) then b.%I end)::%s as %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname)
  when a.attname like 'costo_%' or a.attname in ('consuntivo','movimenti_magazzino_senza_costo','rimborsi_km_da_approvare','numero_rimborsi_km_da_approvare') then format('(case when coalesce((r.rights->>''costs'')::boolean,false) then b.%I end)::%s as %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname)
  else format('b.%I',a.attname) end,',' order by a.attnum) into cols from pg_attribute a
  where a.attrelid='private.office_order_economics_base'::regclass and a.attnum>0 and not a.attisdropped;
 execute 'create or replace function private.office_order_economics_projection() returns setof private.office_order_economics_base language sql stable security definer set search_path='''''||' as $projection$ select '||cols||' from private.office_order_economics_base b cross join lateral(select private.office_order_rights(b.id) rights offset 0) r where private.office_visible_order(b.id) $projection$';
 revoke all on function private.office_order_economics_projection() from public,anon;
 grant execute on function private.office_order_economics_projection() to authenticated;
 create or replace view public.v_ordine_marginalita with(security_barrier=true,security_invoker=true) as select * from private.office_order_economics_projection();
end $canonical$;

-- Preserve the established payment calculations, then remove unauthorized
-- branches from the server response (including indirect RPC reads).
do $payment_raw$
declare def text;
begin
 if to_regprocedure('private.office_quadro_pagamenti_raw(uuid)') is null then
  def:=pg_get_functiondef('public.commessa_quadro_pagamenti(uuid)'::regprocedure);
  execute replace(def,'public.commessa_quadro_pagamenti(', 'private.office_quadro_pagamenti_raw(');
 end if;
end $payment_raw$;
revoke all on function private.office_quadro_pagamenti_raw(uuid) from public,anon,authenticated,service_role;
create or replace function public.commessa_quadro_pagamenti(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare rights jsonb:=private.office_order_rights(p_order_id); data jsonb; installments jsonb;
begin
 if not private.office_visible_order(p_order_id) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 data:=private.office_quadro_pagamenti_raw(p_order_id);
 if coalesce((rights->>'amounts')::boolean,false) then installments:=data->'rate';
 elsif coalesce((rights->>'payments')::boolean,false) then
  select coalesce(jsonb_agg(jsonb_build_object('id',v->'id','position',v->'position','type',v->'type','is_paid',v->'is_paid','paid_date',v->'paid_date','expected_date',v->'expected_date','scaduta',v->'scaduta')),'[]') into installments from jsonb_array_elements(coalesce(data->'rate','[]')) v;
 else installments:='[]'; end if;
 return jsonb_build_object('oggi',data->'oggi','rate',coalesce(installments,'[]'),
 'sal_cliente',case when coalesce((rights->>'amounts')::boolean,false) then data->'sal_cliente' else '[]'::jsonb end,
 'uscite',case when coalesce((rights->>'costs')::boolean,false) then data->'uscite' else '[]'::jsonb end,
 'mezzi_stimati',case when coalesce((rights->>'costs')::boolean,false) then data->'mezzi_stimati' end);
end $f$;
revoke all on function public.commessa_quadro_pagamenti(uuid) from public,anon;
grant execute on function public.commessa_quadro_pagamenti(uuid) to authenticated,service_role;
create or replace function public.commessa_stato_incassi(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare rights jsonb:=private.office_order_rights(p_order_id); total integer; paid integer;
begin
 if not coalesce((rights->>'payments')::boolean,false) then raise exception 'Stato incassi non consentito' using errcode='42501'; end if;
 select count(*),count(*) filter(where is_paid) into total,paid from public.order_installments where order_id=p_order_id;
 return jsonb_build_object('status',case when total=0 then 'senza_piano' when paid=total then 'rate_incassate' when paid=0 then 'da_incassare' else 'parziale' end);
end $f$;
revoke all on function public.commessa_stato_incassi(uuid) from public,anon;
grant execute on function public.commessa_stato_incassi(uuid) to authenticated;
notify pgrst,'reload schema';

-- Direct minimal-return writes cannot change fields the caller cannot read.
-- Trusted definers already validate their scoped operations and run as owner.
create or replace function private.office_assert_financial_write(p_table text,p_old jsonb,p_new jsonb)
returns void language plpgsql security definer set search_path=''
as $f$
declare rights jsonb; field record; oid_row uuid; default_expr text; default_value jsonb;
begin
 if p_table not in ('orders','order_installments','order_employees','campo_rapportini') or auth.uid() is null then raise exception 'Scrittura non consentita' using errcode='42501'; end if;
 oid_row:=case when p_table='orders' then (p_new->>'id')::uuid else (p_new->>'order_id')::uuid end;
 rights:=case when p_table='orders' and p_old is null then private.office_company_rights((p_new->>'company_id')::uuid) else private.office_order_rights(oid_row) end;
 for field in select * from private.office_projection_fields where table_name=p_table loop
  if coalesce((rights->>field.right_name)::boolean,false) and (field.right_name<>'payments' or coalesce((rights->>'amounts')::boolean,false)) then continue; end if;
  if p_old is not null and (p_new->field.column_name) is not distinct from (p_old->field.column_name) then continue; end if;
  if p_old is null then
   if p_new->field.column_name='null'::jsonb then continue; end if;
   select pg_get_expr(d.adbin,d.adrelid) into default_expr from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=format('public.%I',p_table)::regclass and a.attname=field.column_name;
   if default_expr is not null then execute 'select to_jsonb('||default_expr||')' into default_value; if (p_new->field.column_name) is not distinct from default_value then continue; end if; end if;
  end if;
  raise exception 'Campo economico non modificabile' using errcode='42501';
 end loop;
end $f$;
revoke all on function private.office_assert_financial_write(text,jsonb,jsonb) from public,anon;
grant execute on function private.office_assert_financial_write(text,jsonb,jsonb) to authenticated;
create or replace function private.office_direct_write_guard()
returns trigger language plpgsql set search_path=''
as $f$
begin
 if current_user='authenticated' then
  perform private.office_assert_financial_write(tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 end if;
 return new;
end $f$;
revoke all on function private.office_direct_write_guard() from public,anon,authenticated;
do $guard$
declare t text;
begin foreach t in array array['orders','order_installments','order_employees'] loop
 execute format('drop trigger if exists aaa_office_direct_write on public.%I',t);
 execute format('create trigger aaa_office_direct_write before insert or update on public.%I for each row execute function private.office_direct_write_guard()',t);
end loop;end $guard$;

-- A work-report read is another route to individual rates: hide the internal
-- people rows and expose one unlabelled aggregate unless HR detail is granted.
do $report_raw$
declare def text;
begin if to_regprocedure('private.office_rapportino_economia_raw(uuid)') is null then
 def:=pg_get_functiondef('public.rapportino_quadro_economico(uuid)'::regprocedure);
 execute replace(def,'public.rapportino_quadro_economico(', 'private.office_rapportino_economia_raw(');
end if;end $report_raw$;
revoke all on function private.office_rapportino_economia_raw(uuid) from public,anon,authenticated,service_role;
create or replace function public.rapportino_quadro_economico(p_rapportino_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare o uuid; rights jsonb; data jsonb; people jsonb; cost numeric;
begin
 select order_id into o from public.campo_rapportini where id=p_rapportino_id;
 rights:=private.office_order_rights(o);
 if not coalesce((rights->>'costs')::boolean,false) then raise exception 'Costi non consentiti' using errcode='42501'; end if;
 data:=private.office_rapportino_economia_raw(p_rapportino_id);
 if not coalesce((rights->>'personal')::boolean,false) then
  select sum((v->>'costo')::numeric) into cost from jsonb_array_elements(coalesce(data->'persone','[]'))v where not coalesce((v->>'ditta')::boolean,false);
  select coalesce(jsonb_agg(v),'[]') into people from jsonb_array_elements(coalesce(data->'persone','[]'))v where coalesce((v->>'ditta')::boolean,false);
  data:=jsonb_set(data,'{persone}',people)||jsonb_build_object('personale_aggregato',jsonb_build_object('costo',cost));
 end if;
 if not coalesce((rights->>'amounts')::boolean,false) then
  select coalesce(jsonb_agg(v-'prezzo'-'ricavo'),'[]') into people from jsonb_array_elements(coalesce(data->'persone','[]'))v;
  data:=jsonb_set(data,'{persone}',people);
 end if;
 return private.office_log_values('rapportino_voci_libere',data,rights);
end $f$;
revoke all on function public.rapportino_quadro_economico(uuid) from public,anon;
grant execute on function public.rapportino_quadro_economico(uuid) to authenticated;

-- Audit/history values are data too: a cost permission is not HR permission.
create or replace function private.office_log_values(p_table text,p_values jsonb,p_rights jsonb)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare k text; v jsonb; right_name text; out_value jsonb:='{}';
begin
 if p_values is null then return null; end if;
 if jsonb_typeof(p_values)='array' then
  select coalesce(jsonb_agg(private.office_log_values(p_table,x,p_rights)),'[]') into out_value from jsonb_array_elements(p_values)x;return out_value;
 end if;
 if jsonb_typeof(p_values)<>'object' then return p_values; end if;
 for k,v in select * from jsonb_each(p_values) loop
  select f.right_name into right_name from private.office_projection_fields f where f.table_name=p_table and f.column_name=k;
  if right_name is null then right_name:=case
   when k~*'(salary|stipend|inps|hourly|tariff|costo_orario)' then 'personal'
   when k~*'(margin)' then 'margins'
   when k~*'(cost|purchase_price|prezzo_acquisto)' then case when p_table in ('employees','order_employees','hr_profili') then 'personal' else 'costs' end
   when k~*'(amount|import|price|prezz|total|deposit|balance|financ|vendit|ricav)' then 'amounts'
   else null end; end if;
  if right_name is not null and not coalesce((p_rights->>right_name)::boolean,false) then continue; end if;
  out_value:=out_value||jsonb_build_object(k,private.office_log_values(p_table,v,p_rights));
 end loop;
 return out_value;
end $f$;
revoke all on function private.office_log_values(text,jsonb,jsonb) from public,anon,authenticated;
create or replace function public.registro_commessa(p_order_id uuid,p_limite integer default 3000)
returns table(id bigint,quando timestamptz,user_id uuid,chi text,azione text,tabella text,record_id text,etichetta text,campi text[],valori jsonb,volte integer)
language plpgsql stable security definer set search_path=''
as $f$
declare company uuid; rights jsonb:=private.office_order_rights(p_order_id);
begin
 if not private.office_visible_order(p_order_id) or public.utente_e_cliente_esterno() or public.e_solo_campo() then return; end if;
 select company_id into company from public.orders where public.orders.id=p_order_id;
 return query select l.id,l.created_at,l.user_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Utente eliminato'),l.azione,l.tabella,l.record_id,l.etichetta,l.campi_modificati,private.office_log_values(l.tabella,l.valori,rights),l.volte
 from public.user_action_log l left join public.profiles p on p.id=l.user_id where l.order_id=p_order_id and l.company_id=company order by l.created_at desc limit greatest(1,least(p_limite,5000));
end $f$;
revoke all on function public.registro_commessa(uuid,integer) from public,anon;
grant execute on function public.registro_commessa(uuid,integer) to authenticated;
drop policy if exists office_log_financial_read on public.user_action_log;
create policy office_log_financial_read on public.user_action_log as restrictive for select to authenticated
 using(order_id is null or (coalesce((private.office_order_rights(order_id)->>'amounts')::boolean,false) and coalesce((private.office_order_rights(order_id)->>'costs')::boolean,false) and coalesce((private.office_order_rights(order_id)->>'margins')::boolean,false) and coalesce((private.office_order_rights(order_id)->>'personal')::boolean,false)));
notify pgrst,'reload schema';

-- CASE-masked invoice identifiers cannot be inferred as a foreign key by
-- PostgREST. This invoker relationship retains document RLS and a single row.
create or replace function public.documenti_fiscali(public.order_installments_visibili)
returns setof public.documenti_fiscali rows 1 language sql stable set search_path=''
as $$ select d.* from public.documenti_fiscali d where d.id=$1.documento_fiscale_id $$;
revoke all on function public.documenti_fiscali(public.order_installments_visibili) from public,anon;
grant execute on function public.documenti_fiscali(public.order_installments_visibili) to authenticated;
notify pgrst,'reload schema';

-- Planning also returns current employee rates. Keep the established planning
-- calculations, then project economic fields with the same order rights.
do $planning$
declare def text;
begin
 if to_regprocedure('private.office_piano_cantiere_raw(uuid)') is null then
  def:=pg_get_functiondef('public.piano_cantiere_dati(uuid)'::regprocedure);
  execute replace(def,'public.piano_cantiere_dati(', 'private.office_piano_cantiere_raw(');
 end if;
end $planning$;
revoke all on function private.office_piano_cantiere_raw(uuid) from public,anon,authenticated,service_role;
create or replace function public.piano_cantiere_dati(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare rights jsonb:=private.office_order_rights(p_order_id); result jsonb;
begin
 if not private.office_visible_order(p_order_id) then raise exception 'Commessa non visibile' using errcode='42501';end if;
 result:=private.office_piano_cantiere_raw(p_order_id);
 if not coalesce((rights->>'costs')::boolean,false) then result:=result-'economia'-'materiali_commessa';end if;
 return private.office_log_values('piano_cantiere',result,rights);
end $$;
revoke all on function public.piano_cantiere_dati(uuid) from public,anon;
grant execute on function public.piano_cantiere_dati(uuid) to authenticated;

-- The internal margin evaluator must calculate with full data, even when an
-- operational user caused the update. Its existing service-only ACL is retained.
-- Financial notification text is sent only to recipients with both permissions.
do $margin_internal$
declare def text;
begin
 def:=pg_get_functiondef('public.ordine_margine_valuta(uuid,text)'::regprocedure);
 def:=replace(def,'JOIN public.v_ordine_marginalita v ON','JOIN private.office_order_economics_base v ON');
 if position('office economic recipient' in def)=0 then
  if position('INSERT INTO public.notifications' in def)=0 then raise exception 'Valutatore margine inatteso';end if;
  def:=replace(def,'INSERT INTO public.notifications',E'-- office economic recipient\n    IF NOT (public.has_permission_for_company(f.user_id,''can_view_margins'',m.company_id) AND public.has_permission_for_company(f.user_id,''can_view_costs'',m.company_id)) THEN CONTINUE; END IF;\n    INSERT INTO public.notifications');
 end if;
 execute def;
end $margin_internal$;
notify pgrst,'reload schema';

-- Approved reports retain a per-person cost snapshot. Protect this source too,
-- otherwise a journal read would disclose the rates removed from the ledger.
insert into private.office_projection_fields values
 ('campo_rapportini','presenze_registrate','personal'),('campo_rapportini','costo_manodopera','costs')
on conflict(table_name,column_name) do update set right_name=excluded.right_name;
do $journal$
declare predicate text; cols text; d record;
begin
 select '('||coalesce(string_agg('('||coalesce(pg_get_expr(polqual,polrelid),'true')||')',' OR ') filter(where polpermissive),'false')||') AND ('||coalesce(string_agg('('||coalesce(pg_get_expr(polqual,polrelid),'true')||')',' AND ') filter(where not polpermissive),'true')||')'
 into predicate from pg_policy where polrelid='public.campo_rapportini'::regclass and polcmd in ('r','*') and polname not like 'office_%' and (0=any(polroles) or 'authenticated'::regrole::oid=any(polroles));
 select string_agg(case
 when a.attname='presenze_registrate' then 'private.office_log_values(''order_employees'',cr.presenze_registrate,r.rights) as presenze_registrate'
 when a.atttypid='jsonb'::regtype then format('private.office_log_values(''campo_rapportini'',cr.%I,r.rights) as %I',a.attname,a.attname)
 when a.attname='costo_manodopera' then 'case when coalesce((r.rights->>''costs'')::boolean,false) then cr.costo_manodopera end as costo_manodopera'
 else format('cr.%I',a.attname) end,',' order by a.attnum) into cols from pg_attribute a where a.attrelid='public.campo_rapportini'::regclass and a.attnum>0 and not a.attisdropped;
 execute 'create or replace view public.campo_rapportini_visibili with(security_barrier=true) as select '||cols||' from public.campo_rapportini cr cross join lateral(select private.office_order_rights(cr.order_id) rights offset 0) r where auth.uid() is not null and private.office_visible_order(cr.order_id) and ('||replace(predicate,'campo_rapportini.','cr.')||')';
 for d in select a.attname,pg_get_expr(ad.adbin,ad.adrelid) expr from pg_attribute a join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.campo_rapportini'::regclass loop
  execute format('alter view public.campo_rapportini_visibili alter column %I set default %s',d.attname,d.expr);
 end loop;
end $journal$;
revoke all on public.campo_rapportini_visibili from public,anon;
grant select,insert,update,delete on public.campo_rapportini_visibili to authenticated;
drop trigger if exists office_projection_write on public.campo_rapportini_visibili;
create trigger office_projection_write instead of insert or update or delete on public.campo_rapportini_visibili for each row execute function private.office_projection_write();
drop trigger if exists aaa_office_direct_write on public.campo_rapportini;
create trigger aaa_office_direct_write before insert or update on public.campo_rapportini for each row execute function private.office_direct_write_guard();
drop policy if exists office_financial_select on public.campo_rapportini;
create policy office_financial_select on public.campo_rapportini as restrictive for select to authenticated
 using(coalesce((private.office_order_rights(order_id)->>'personal')::boolean,false));
notify pgrst,'reload schema';
-- Pure projection helper: it processes only the supplied JSON and returns no
-- database rows. View callers require EXECUTE; private schema is not API-exposed.
grant execute on function private.office_log_values(text,jsonb,jsonb) to authenticated;
