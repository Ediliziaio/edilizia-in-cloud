-- Local draft: CRM portfolio scope is independent of office order access.
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table public.staff_permissions add column if not exists office_profile text;

create or replace function public.can_see_order(_order_id uuid,_assigned_to uuid,_warehouse_id uuid default null)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare u uuid:=auth.uid(); c uuid:=public.get_effective_company_id(); warehouse_only boolean;
begin
 if u is null or public.utente_bloccato() then return false;end if;
 if public.has_role(u,'super_admin'::public.app_role) or public.e_amministratore_di(c) then return true;end if;
 -- Field crews retain assignment isolation independently of the CRM switch.
 if public.e_solo_campo() then
  return coalesce(_assigned_to=u,false) or exists(select 1 from public.order_campo_assignments a where a.order_id=_order_id and a.user_id=u) or public.order_has_employee_for_user(_order_id,u);
 end if;
 select coalesce(bool_or(only_my_warehouse),false) into warehouse_only from public.staff_permissions where user_id=u and company_id=c;
 if warehouse_only then return coalesce(_assigned_to=u,false) or coalesce(_warehouse_id=any(public.get_my_warehouse_ids()),false) or coalesce(public.order_has_item_in_my_warehouse(_order_id),false);end if;
 return true;
end $$;
create or replace function public.ufficio_vede_tutte_le_commesse()
returns boolean language sql stable security definer set search_path=''
as $$select auth.uid() is not null and not public.utente_bloccato() and not public.e_solo_campo() and (
 public.has_role(auth.uid(),'super_admin'::public.app_role) or public.e_amministratore_di(public.get_effective_company_id()) or
 (public.has_permission(auth.uid(),'can_view_orders') and not exists(select 1 from public.staff_permissions p where p.user_id=auth.uid() and p.company_id=public.get_effective_company_id() and coalesce(p.only_my_warehouse,false))))$$;

-- Retain the existing RPC ACL. Silvio calls on behalf of the authenticated actor.
create or replace function public.silvio_commesse_visibili(p_company_id uuid,p_user_id uuid)
returns table(id uuid,order_code text) language plpgsql stable security definer set search_path=''
as $$
declare p public.staff_permissions%rowtype; field_user boolean;
begin
 perform public.assert_company_access(p_company_id);
 if auth.uid() is not null and auth.uid()<>p_user_id and not public.e_amministratore_di(p_company_id) and not public.has_role(auth.uid(),'super_admin'::public.app_role) then raise exception 'Utente non consentito' using errcode='42501';end if;
 if not exists(select 1 from public.profiles x where x.id=p_user_id and not coalesce(x.is_blocked,false)) then return;end if;
 select * into p from public.staff_permissions x where x.user_id=p_user_id and x.company_id=p_company_id;
 field_user:=(public.has_role(p_user_id,'employee'::public.app_role) or public.has_role(p_user_id,'subcontractor'::public.app_role)) and not public.has_role(p_user_id,'company_staff'::public.app_role);
 if not public.has_permission_for_company(p_user_id,'can_view_orders',p_company_id) and not field_user then return;end if;
 return query select o.id,o.order_code from public.orders o where o.company_id=p_company_id and o.deleted_at is null and
 (not field_user or o.assigned_to=p_user_id or exists(select 1 from public.order_campo_assignments a where a.order_id=o.id and a.user_id=p_user_id) or public.order_has_employee_for_user(o.id,p_user_id)) and
 (not coalesce(p.only_my_warehouse,false) or o.assigned_to=p_user_id or exists(select 1 from public.warehouse_assignments w where w.user_id=p_user_id and w.active and (w.warehouse_id=o.destination_warehouse_id or exists(select 1 from public.order_items i where i.order_id=o.id and i.destination_warehouse_id=w.warehouse_id))));
end $$;

-- Remove the abandoned per-order office membership model, never published.
drop function if exists public.commessa_collaboratori_ufficio(uuid);
drop function if exists public.commessa_collaboratore_salva(uuid,uuid,text,boolean);
drop function if exists private.office_is_collaborator(uuid,uuid);
drop table if exists public.order_office_collaborators;
notify pgrst,'reload schema';

-- Confidential files are classified explicitly; legacy/unclassified files are
-- administrator-only until reviewed. A folder name is not an authorization.
alter table public.order_attachments add column if not exists access_scope text not null default 'riservato' check(access_scope in ('operativo','vendita','costi','personale','riservato'));
create or replace function private.office_attachment_allowed(p_order uuid,p_scope text)
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(private.office_visible_order(p_order) and case p_scope
 when 'operativo' then true
 when 'vendita' then coalesce((private.office_order_rights(p_order)->>'amounts')::boolean,false)
 when 'costi' then coalesce((private.office_order_rights(p_order)->>'costs')::boolean,false)
 when 'personale' then coalesce((private.office_order_rights(p_order)->>'personal')::boolean,false)
 when 'riservato' then public.e_amministratore_di((select company_id from public.orders where id=p_order)) or public.has_role(auth.uid(),'super_admin'::public.app_role)
 else false end,false) $$;
revoke all on function private.office_attachment_allowed(uuid,text) from public,anon;
grant execute on function private.office_attachment_allowed(uuid,text) to authenticated;
drop policy if exists office_attachment_scope on public.order_attachments;
create policy office_attachment_scope on public.order_attachments as restrictive for select to authenticated using(private.office_attachment_allowed(order_id,access_scope));
drop policy if exists office_attachment_read on public.order_attachments;
create policy office_attachment_read on public.order_attachments for select to authenticated using(private.office_attachment_allowed(order_id,access_scope));
drop policy if exists office_attachment_insert on public.order_attachments;
create policy office_attachment_insert on public.order_attachments for insert to authenticated with check(private.office_attachment_allowed(order_id,access_scope) and public.has_permission_for_company(auth.uid(),'can_edit_orders',public.get_order_company_id(order_id)) and not public.utente_sola_lettura(public.get_order_company_id(order_id)));
drop policy if exists office_attachment_write_guard on public.order_attachments;
create policy office_attachment_write_guard on public.order_attachments as restrictive for all to authenticated using(private.office_attachment_allowed(order_id,access_scope)) with check(private.office_attachment_allowed(order_id,access_scope) and public.has_permission_for_company(auth.uid(),'can_edit_orders',public.get_order_company_id(order_id)) and not public.utente_sola_lettura(public.get_order_company_id(order_id)));

create or replace function private.office_attachment_identity_guard()
returns trigger language plpgsql security definer set search_path=''
as $$begin
 if tg_op='UPDATE' and auth.uid() is not null and (old.order_id<>new.order_id or old.file_url<>new.file_url or old.access_scope<>new.access_scope) and not public.e_amministratore_di(public.get_order_company_id(old.order_id)) then raise exception 'Identità e riservatezza del documento non modificabili' using errcode='42501';end if;
 if auth.uid() is not null and not (
  new.file_url like new.order_id::text||'/%' or new.file_url like 'orders/'||new.order_id::text||'/%' or
  new.file_url like 'order-variation-documents/'||public.get_order_company_id(new.order_id)::text||'/'||new.order_id::text||'/%' or
  exists(select 1 from public.order_attachments a where a.file_url=new.file_url and a.order_id=new.order_id and a.access_scope=new.access_scope)
 ) then raise exception 'Il file non appartiene alla commessa' using errcode='42501';end if;
 if auth.uid() is not null and new.thumb_path is not null and not (new.thumb_path like new.order_id::text||'/%' or new.thumb_path like 'orders/'||new.order_id::text||'/%' or exists(select 1 from public.order_attachments a where a.id=new.id and a.thumb_path=new.thumb_path)) then raise exception 'Miniatura non consentita' using errcode='42501';end if;
 if exists(select 1 from public.order_attachments a where a.file_url=new.file_url and a.id<>new.id and (a.order_id<>new.order_id or a.access_scope<>new.access_scope)) then raise exception 'Documento già classificato' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.office_attachment_identity_guard() from public,anon,authenticated;
drop trigger if exists office_attachment_identity on public.order_attachments;
create trigger office_attachment_identity before insert or update on public.order_attachments for each row execute function private.office_attachment_identity_guard();

-- Restrictive storage policy also covers direct downloads / signed-URL creation.
create or replace function private.office_attachment_file_allowed(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=''
as $$select auth.uid() is not null and not public.utente_bloccato() and exists(
 select 1 from public.order_attachments a where
 (a.file_url=case when p_bucket='order-variation-documents' then p_bucket||'/'||p_path else p_path end or (p_bucket='order-attachments' and a.thumb_path=p_path))
 and private.office_attachment_allowed(a.order_id,a.access_scope) and (not public.utente_e_cliente_esterno() or a.visible_to_customer))
 and not exists(select 1 from public.order_attachments a where
 (a.file_url=case when p_bucket='order-variation-documents' then p_bucket||'/'||p_path else p_path end or (p_bucket='order-attachments' and a.thumb_path=p_path))
 and (not private.office_attachment_allowed(a.order_id,a.access_scope) or (public.utente_e_cliente_esterno() and not a.visible_to_customer)))$$;
revoke all on function private.office_attachment_file_allowed(text,text) from public,anon;
grant execute on function private.office_attachment_file_allowed(text,text) to authenticated;
drop policy if exists office_attachment_file_read on storage.objects;
create policy office_attachment_file_read on storage.objects as restrictive for select to authenticated using(bucket_id not in ('order-attachments','order-variation-documents') or private.office_attachment_file_allowed(bucket_id,name));
update storage.buckets set public=false where id in ('order-attachments','order-variation-documents');
notify pgrst,'reload schema';

-- Export math uses grouped costs, never one ledger row per employee.
create or replace function public.commessa_costo_personale_per_fase(p_order_id uuid)
returns table(phase_id uuid,total_cost numeric,cost_preventivo numeric)
language plpgsql stable security definer set search_path=''
as $$begin
 if not coalesce((private.office_order_rights(p_order_id)->>'costs')::boolean,false) then raise exception 'Costi non consentiti' using errcode='42501';end if;
 return query select e.phase_id,sum(e.total_cost)::numeric,sum(e.cost_preventivo)::numeric from public.order_employees e where e.order_id=p_order_id group by e.phase_id;
end$$;
revoke all on function public.commessa_costo_personale_per_fase(uuid) from public,anon;
grant execute on function public.commessa_costo_personale_per_fase(uuid) to authenticated;
notify pgrst,'reload schema';

-- Operational activities/calendar do not inherit the commercial portfolio cap.
create or replace function public.check_office_visibility(_user_id uuid,_assigned_to uuid)
returns boolean language sql stable security definer set search_path=''
as $$select auth.uid() is not null and auth.uid()=_user_id and not public.utente_bloccato() and (not public.e_solo_campo() or public.check_staff_visibility(_user_id,_assigned_to))$$;
revoke all on function public.check_office_visibility(uuid,uuid) from public,anon;
grant execute on function public.check_office_visibility(uuid,uuid) to authenticated;
do $operational_scope$
declare r record; old_using text; old_check text; new_using text; new_check text; crm text; def text;
begin
 for r in select p.*,c.relname from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace and c.relname in ('tasks','appointments','tickets','support_tickets','customer_complaints') loop
  old_using:=pg_get_expr(r.polqual,r.polrelid);old_check:=pg_get_expr(r.polwithcheck,r.polrelid);
  if position('check_staff_visibility' in coalesce(old_using,'')||coalesce(old_check,''))=0 or position('check_office_visibility' in coalesce(old_using,'')||coalesce(old_check,''))>0 then continue;end if;
  crm:='false';
  if r.relname in('tasks','appointments') then
   if exists(select 1 from pg_attribute a where a.attrelid=r.polrelid and a.attname='contact_id' and not a.attisdropped) then crm:=crm||' or contact_id is not null';end if;
   if exists(select 1 from pg_attribute a where a.attrelid=r.polrelid and a.attname='opportunity_id' and not a.attisdropped) then crm:=crm||' or opportunity_id is not null';end if;
   if exists(select 1 from pg_attribute a where a.attrelid=r.polrelid and a.attname='order_id' and not a.attisdropped) then crm:='order_id is null and ('||crm||')';end if;
  end if;
  if old_using is not null then new_using:='case when '||crm||' then ('||old_using||') else ('||replace(old_using,'check_staff_visibility','check_office_visibility')||') end';execute format('alter policy %I on public.%I using (%s)',r.polname,r.relname,new_using);end if;
  if old_check is not null then new_check:='case when '||crm||' then ('||old_check||') else ('||replace(old_check,'check_staff_visibility','check_office_visibility')||') end';execute format('alter policy %I on public.%I with check (%s)',r.polname,r.relname,new_check);end if;
 end loop;
 for r in select oid from pg_proc where pronamespace='public'::regnamespace and prokind='f' and (proname like 'rapportino%' or proname like 'ufficio%') and prosrc like '%check_staff_visibility%' loop
  def:=replace(pg_get_functiondef(r.oid),'check_staff_visibility','check_office_visibility');execute def;
 end loop;
end $operational_scope$;
notify pgrst,'reload schema';
-- Customer sharing remains explicit; office access must not widen the portal.
drop policy if exists office_attachment_read on public.order_attachments;
create policy office_attachment_read on public.order_attachments for select to authenticated using(private.office_attachment_allowed(order_id,access_scope) and (not public.utente_e_cliente_esterno() or visible_to_customer));
drop policy if exists office_attachment_scope on public.order_attachments;
create policy office_attachment_scope on public.order_attachments as restrictive for select to authenticated using(private.office_attachment_allowed(order_id,access_scope) and (not public.utente_e_cliente_esterno() or visible_to_customer));
drop policy if exists office_attachment_write_guard on public.order_attachments;
create policy office_attachment_write_guard on public.order_attachments as restrictive for all to authenticated using(private.office_attachment_allowed(order_id,access_scope) and (not public.utente_e_cliente_esterno() or visible_to_customer)) with check(private.office_attachment_allowed(order_id,access_scope) and not public.utente_e_cliente_esterno() and public.has_permission_for_company(auth.uid(),'can_edit_orders',public.get_order_company_id(order_id)) and not public.utente_sola_lettura(public.get_order_company_id(order_id)));
drop policy if exists office_attachment_update on public.order_attachments;
create policy office_attachment_update on public.order_attachments for update to authenticated using(private.office_attachment_allowed(order_id,access_scope) and public.has_permission_for_company(auth.uid(),'can_edit_orders',public.get_order_company_id(order_id)) and not public.utente_sola_lettura(public.get_order_company_id(order_id))) with check(private.office_attachment_allowed(order_id,access_scope) and public.has_permission_for_company(auth.uid(),'can_edit_orders',public.get_order_company_id(order_id)) and not public.utente_sola_lettura(public.get_order_company_id(order_id)));
drop policy if exists office_attachment_delete on public.order_attachments;
create policy office_attachment_delete on public.order_attachments for delete to authenticated using(private.office_attachment_allowed(order_id,access_scope) and public.has_permission_for_company(auth.uid(),'can_edit_orders',public.get_order_company_id(order_id)) and not public.utente_sola_lettura(public.get_order_company_id(order_id)));
