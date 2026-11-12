-- Shared office activities: ownership never grants access to linked records.
create or replace function private.office_task_links_allowed(t public.tasks)
returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
 and t.company_id=public.get_effective_company_id()
 and (public.utente_in_ufficio(auth.uid(),t.ufficio_id) or public.e_amministratore_di(t.company_id) or public.has_permission_for_company(auth.uid(),'can_view_team_tasks',t.company_id))
 and (t.order_id is null or exists(select 1 from public.orders_visibili x where x.id=t.order_id and x.company_id=t.company_id))
 and (t.contact_id is null or exists(select 1 from public.marketing_contacts x where x.id=t.contact_id and x.company_id=t.company_id))
 and (t.opportunity_id is null or exists(select 1 from public.marketing_opportunities x where x.id=t.opportunity_id and x.company_id=t.company_id))
 and (t.cost_id is null or ((public.has_permission_for_company(auth.uid(),'can_view_costs',t.company_id) or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',t.company_id)) and exists(select 1 from public.company_costs x where x.id=t.cost_id and x.company_id=t.company_id)))
 and (t.stock_item_id is null or exists(select 1 from public.warehouse_stock x where x.id=t.stock_item_id and x.company_id=t.company_id))
 and (t.ticket_id is null or exists(select 1 from public.tickets x where x.id=t.ticket_id and x.company_id=t.company_id))
 and exists(select 1 from public.company_uffici u where u.id=t.ufficio_id and u.company_id=t.company_id and u.attivo);
$$;
revoke all on function private.office_task_links_allowed(public.tasks) from public,anon;
grant execute on function private.office_task_links_allowed(public.tasks) to authenticated,service_role;
drop policy if exists office_task_link_scope on public.tasks;
create policy office_task_link_scope on public.tasks as restrictive for all to authenticated
 using(ufficio_id is null or private.office_task_links_allowed(tasks))
 with check(ufficio_id is null or private.office_task_links_allowed(tasks));

create or replace view public.tasks_personali_e_aree with(security_invoker=true) as
 select t.*, (t.ufficio_id is not null and public.utente_in_ufficio(auth.uid(),t.ufficio_id)) as area_mia from public.tasks t where t.assigned_to=auth.uid()
 or (t.ufficio_id is not null and public.utente_in_ufficio(auth.uid(),t.ufficio_id));
revoke all on public.tasks_personali_e_aree from public,anon;
grant select on public.tasks_personali_e_aree to authenticated;

create or replace function public.office_area_task_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare manager boolean;
begin
 if tg_op='UPDATE' and (new.company_id is distinct from old.company_id or new.created_by is distinct from old.created_by) and (new.ufficio_id is not null or old.ufficio_id is not null) then raise exception 'Azienda e autore non modificabili' using errcode='42501'; end if;
 if new.ufficio_id is null and (tg_op='INSERT' or old.ufficio_id is null) then return new; end if;
 if auth.uid() is null then
   if current_user='service_role' or auth.jwt()->>'role'='service_role' or (auth.jwt()->>'role' is null and session_user in ('postgres','supabase_admin') and current_user in ('postgres','supabase_admin')) then
     if new.ufficio_id is not null and not exists(select 1 from public.company_uffici u where u.id=new.ufficio_id and u.company_id=new.company_id and u.attivo) then raise exception 'Area non valida per l’azienda' using errcode='23514';end if;
     return new;
   end if;
   raise exception 'Sessione personale richiesta' using errcode='42501';
 end if;
 if new.ufficio_id is not null and not private.office_task_links_allowed(new) then
   raise exception 'Area o collegamento non accessibile nella tua azienda' using errcode='42501';
 end if;
 manager:= public.e_amministratore_di(new.company_id) or (public.has_permission_for_company(auth.uid(),'can_view_team_tasks',new.company_id) and public.has_permission_for_company(auth.uid(),'can_edit_orders',new.company_id));
 if tg_op='INSERT' then
   if not manager and not public.utente_in_ufficio(auth.uid(),new.ufficio_id) then
     raise exception 'Puoi assegnare soltanto alle tue aree' using errcode='42501'; end if;
 elsif not manager and old.created_by is distinct from auth.uid() then
   if (to_jsonb(new)-array['assigned_to','status','completed_at','updated_at']) is distinct from
      (to_jsonb(old)-array['assigned_to','status','completed_at','updated_at']) then
     raise exception 'Puoi prendere in carico o aggiornare lo stato, non riassegnare o modificare i dati dell’attività' using errcode='42501'; end if;
   if new.assigned_to is distinct from old.assigned_to and
     (not public.utente_in_ufficio(auth.uid(),old.ufficio_id) or
      old.assigned_to is not null and old.assigned_to<>auth.uid() or
      new.assigned_to is not null and new.assigned_to<>auth.uid()) then
     raise exception 'Attività già in carico a un collega' using errcode='40001'; end if;
 end if;
 if new.ufficio_id is not null and new.assigned_to is not null and
    not public.utente_in_ufficio(new.assigned_to,new.ufficio_id) then
   raise exception 'Il responsabile deve appartenere all’area' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function public.office_area_task_guard() from public,anon;
drop trigger if exists z_office_area_task_guard on public.tasks;
create trigger z_office_area_task_guard before insert or update on public.tasks
 for each row execute function public.office_area_task_guard();

create or replace function public.attivita_prendi_in_carico(p_task uuid,p_rilascia boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.tasks;
begin
 select * into t from public.tasks where id=p_task for update;
 if not found or auth.uid() is null or public.utente_sola_lettura(t.company_id)
    or t.ufficio_id is null or not public.utente_in_ufficio(auth.uid(),t.ufficio_id) then
   raise exception 'Attività non disponibile per il tuo utente' using errcode='42501'; end if;
 if t.completed_at is not null then raise exception 'Attività già completata' using errcode='23514'; end if;
 if t.assigned_to is not null and t.assigned_to<>auth.uid() then
   raise exception 'Un collega ha già preso in carico questa attività' using errcode='40001'; end if;
 update public.tasks set assigned_to=case when p_rilascia then null else auth.uid() end where id=t.id;
 if not found then raise exception 'Presa in carico non autorizzata' using errcode='42501'; end if;
 return t.id;
end $$;
revoke all on function public.attivita_prendi_in_carico(uuid,boolean) from public,anon;
grant execute on function public.attivita_prendi_in_carico(uuid,boolean) to authenticated;

-- A generic notification carries no confidential title or linked financial data.
create or replace function private.notify_office_area_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.ufficio_id is null then return new; end if;
 if tg_op='UPDATE' and new.ufficio_id is not distinct from old.ufficio_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.completed_at is not distinct from old.completed_at then return new; end if;
 insert into public.notifications(company_id,user_id,type,title,body,entity_type,entity_id,action_url)
 select new.company_id,m.profile_id,'task_area','Aggiornamento attività della tua area',
 case when new.completed_at is not null then 'Un’attività condivisa è stata completata.'
 when new.assigned_to is not null then 'Un’attività condivisa è stata presa in carico.'
 else 'Un’attività è disponibile per la tua area.' end,
 'task',new.id,'/azienda/attivita'
 from public.ufficio_membri m join public.company_uffici u on u.id=m.ufficio_id and u.company_id=m.company_id
 where m.ufficio_id=new.ufficio_id and m.company_id=new.company_id and u.attivo;
 return new;
end $$;
revoke all on function private.notify_office_area_task() from public,anon,authenticated;
drop trigger if exists notify_office_area_task on public.tasks;
create trigger notify_office_area_task after insert or update on public.tasks
 for each row execute function private.notify_office_area_task();
notify pgrst,'reload schema';
-- CRM-only auto-assignment must not turn an office queue into a personal task.
drop trigger if exists trg_assegna_attivita_a_chi_crea on public.tasks;
create trigger trg_assegna_attivita_a_chi_crea before insert on public.tasks
 for each row when(new.ufficio_id is null) execute function public.assegna_colonna_a_chi_crea('assigned_to');
-- Every child read/write must also pass the parent's current authorization.
do $$ declare t text; begin
 foreach t in array array['task_comments','task_checklist_items','task_attachments'] loop
 execute format('drop policy if exists office_task_parent_scope on public.%I',t);
 execute format('create policy office_task_parent_scope on public.%I as restrictive for all to authenticated using(exists(select 1 from public.tasks p where p.id=task_id)) with check(exists(select 1 from public.tasks p where p.id=task_id))',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public) values('task-attachments','task-attachments',false) on conflict(id) do update set public=false;
drop policy if exists office_task_storage_scope on storage.objects;
create policy office_task_storage_scope on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'task-attachments' or exists(select 1 from public.tasks p
 where p.id::text=split_part(name,'/',2) and p.company_id::text=split_part(name,'/',1)))
 with check(bucket_id<>'task-attachments' or (not public.utente_sola_lettura(public.get_effective_company_id()) and exists(select 1 from public.tasks p
 where p.id::text=split_part(name,'/',2) and p.company_id::text=split_part(name,'/',1))));
-- The legacy assignee notification includes the title. Shared queues use the
-- generic office broadcast above, including when a colleague lacks link access.
drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned after insert or update of assigned_to on public.tasks
 for each row when(new.ufficio_id is null) execute function public.notify_task_assigned();
-- Extend defaults without discarding existing action policies or company overrides.
do $$ begin
 if to_regprocedure('public.ai_default_action_policy_before_office_areas(text)') is null then
 alter function public.ai_default_action_policy(text) rename to ai_default_action_policy_before_office_areas;
 end if;
end $$;
create or replace function public.ai_default_action_policy(p_action_type text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_action_type=any(array['crea_attivita_area','prendi_in_carico_attivita','rilascia_attivita_area']) then
 return jsonb_build_object('risk_level','yellow','mode','require_confirmation',
 'allowed_roles',jsonb_build_array('company_admin','company_staff','salesperson','call_center','employee','subcontractor'),
 'requires_company_admin',false,'requires_strong_confirmation',false,'max_daily_executions',null);
 end if;
 return public.ai_default_action_policy_before_office_areas(p_action_type);
end $$;
revoke all on function public.ai_default_action_policy_before_office_areas(text) from public,anon;
grant execute on function public.ai_default_action_policy_before_office_areas(text) to authenticated,service_role;
revoke all on function public.ai_default_action_policy(text) from public,anon;
grant execute on function public.ai_default_action_policy(text) to authenticated,service_role;
-- Sanitize broadcasts from older workflow-unlock notification producers too.
create or replace function private.office_task_notification_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tasks;
begin
 if new.entity_type is distinct from 'task' or new.entity_id is null then return new; end if;
 select * into t from public.tasks where id=new.entity_id;
 if not found or t.ufficio_id is null then return new; end if;
 if new.company_id is distinct from t.company_id or not exists(
 select 1 from public.ufficio_membri m join public.company_uffici u on u.id=m.ufficio_id and u.company_id=m.company_id
 join public.profiles p on p.id=m.profile_id and p.company_id=m.company_id
 where m.ufficio_id=t.ufficio_id and m.profile_id=new.user_id and m.company_id=t.company_id and u.attivo and not coalesce(p.is_blocked,false)) then return null;end if;
 new.title:='Aggiornamento attività della tua area';
 new.body:='Un’attività condivisa è stata aggiornata. Aprila per vedere i dettagli consentiti al tuo utente.';
 new.action_url:='/azienda/attivita';
 return new;
end $$;
revoke all on function private.office_task_notification_guard() from public,anon,authenticated;
drop trigger if exists office_task_notification_guard on public.notifications;
create trigger office_task_notification_guard before insert on public.notifications
 for each row execute function private.office_task_notification_guard();
