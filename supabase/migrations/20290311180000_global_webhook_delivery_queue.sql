-- Persistent, tenant-scoped global event deliveries. No old records are backfilled.
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table public.webhook_deliveries
 add column if not exists event_id uuid,
 add column if not exists occurred_at timestamptz,
 add column if not exists dedupe_key text,
 add column if not exists delivery_source text,
 add column if not exists attempt_in_cycle integer not null default 0,
 add column if not exists next_attempt_at timestamptz,
 add column if not exists lease_token uuid,
 add column if not exists lease_until timestamptz;
create unique index if not exists webhook_delivery_event_unique on public.webhook_deliveries(webhook_id,event_id) where event_id is not null;
create unique index if not exists webhook_delivery_dedupe_unique on public.webhook_deliveries(webhook_id,dedupe_key) where dedupe_key is not null;
create index if not exists webhook_delivery_due on public.webhook_deliveries(next_attempt_at) where delivery_source='global' and status in ('pending','retrying');
create schema if not exists private;
create table if not exists private.global_webhook_attempts (
 id bigint generated always as identity primary key,
 delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
 lease_token uuid not null unique,attempt_number integer not null,
 succeeded boolean not null,http_status integer,duration_ms integer,created_at timestamptz not null default now());
alter table private.global_webhook_attempts enable row level security;
revoke all on private.global_webhook_attempts from public,anon,authenticated,service_role;
-- UI reads receipts; only the server may enqueue, lease, finish or forge one.
revoke insert,update,delete on public.webhook_deliveries from public,anon,authenticated;
drop policy if exists company_webhooks on public.webhooks;
drop policy if exists global_webhooks_read on public.webhooks;
create policy global_webhooks_read on public.webhooks for select to authenticated using (
 public.has_permission_for_company((select auth.uid()),'can_view_settings_integrations',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_edit_settings_integrations',company_id));
drop policy if exists global_webhooks_insert on public.webhooks;
create policy global_webhooks_insert on public.webhooks for insert to authenticated with check (
 public.has_permission_for_company((select auth.uid()),'can_edit_settings_integrations',company_id) and not public.utente_sola_lettura(company_id));
drop policy if exists global_webhooks_update on public.webhooks;
create policy global_webhooks_update on public.webhooks for update to authenticated using (
 public.has_permission_for_company((select auth.uid()),'can_edit_settings_integrations',company_id) and not public.utente_sola_lettura(company_id)) with check (
 public.has_permission_for_company((select auth.uid()),'can_edit_settings_integrations',company_id) and not public.utente_sola_lettura(company_id));
drop policy if exists global_webhooks_delete on public.webhooks;
create policy global_webhooks_delete on public.webhooks for delete to authenticated using (
 public.has_permission_for_company((select auth.uid()),'can_edit_settings_integrations',company_id) and not public.utente_sola_lettura(company_id));
revoke select on public.webhooks from public,anon,authenticated;
grant select(id,company_id,name,url,is_active,events,created_by,created_at,updated_at,allowed_ips,timeout_seconds,consecutive_failures,max_consecutive_failures,paused_at,paused_reason) on public.webhooks to authenticated;

create or replace function private.enqueue_global_webhook(co uuid, kind text, data jsonb, dedupe text default null) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare eid uuid:=gen_random_uuid(); inserted integer;
begin
 if co is null then return 0; end if;
 insert into public.webhook_deliveries(webhook_id,event_type,payload,status,attempt_count,event_id,occurred_at,dedupe_key,delivery_source,next_attempt_at)
 select w.id,kind,data,'pending',0,eid,now(),dedupe,'global',now() from public.webhooks w
 where w.company_id=co and w.is_active and w.paused_at is null and kind=any(w.events)
 on conflict do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;
revoke all on function private.enqueue_global_webhook(uuid,text,jsonb,text) from public,anon,authenticated;

create or replace function private.global_webhook_record_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb; o jsonb:='{}'; co uuid; data jsonb; prefix text; field text; kind text; current_state text; previous_state text;
begin
 if tg_op='DELETE' then n:=to_jsonb(old);else n:=to_jsonb(new);end if;
 if tg_op='UPDATE' then o:=to_jsonb(old);end if;
 co:=nullif(n->>'company_id','')::uuid;
 -- Do no work or payload construction for tenants without an active subscription.
 if not exists(select 1 from public.webhooks w where w.company_id=co and w.is_active and w.paused_at is null) then return null;end if;
 data:=jsonb_build_object('id',n->'id','company_id',n->'company_id');
 foreach field in array array['first_name','last_name','email','phone','name','title','assigned_to','contact_id','pipeline_id','stage_id','status','amount','value','total_amount','invoice_id','payment_date','payment_method','appointment_date','appointment_time','calendar_id','due_date','order_code','direction','currency'] loop
  if n?field then data:=data||jsonb_build_object(field,n->field);end if;
 end loop;
 prefix:=case tg_table_name when 'marketing_contacts' then 'contact' when 'marketing_opportunities' then 'opportunity' when 'orders' then 'order' when 'appointments' then 'appointment' when 'tasks' then 'task' else 'payment' end;
 current_state:=n->>'status';previous_state:=o->>'status';
 if prefix='order' and n->>'current_status_id' is not null then
  select lower(replace(s.name,' ','_')) into current_state from public.order_statuses s where s.id=(n->>'current_status_id')::uuid and s.company_id=co;
  select lower(replace(s.name,' ','_')) into previous_state from public.order_statuses s where s.id=nullif(o->>'current_status_id','')::uuid and s.company_id=co;
  data:=data||jsonb_build_object('status_name',current_state,'current_status_id',n->'current_status_id');
  if current_state in ('cancelled','canceled','annullato','annullata','annullati','cancellato','cancellata') then current_state:='cancelled';end if;
  if previous_state in ('cancelled','canceled','annullato','annullata','annullati','cancellato','cancellata') then previous_state:='cancelled';end if;
  -- Same closure rule as Commesse: the final phase excluding support phases.
  if current_state is distinct from 'cancelled' and (n->>'current_status_id')::uuid=(select s.id from public.order_statuses s where s.company_id=co and not s.is_support_phase order by s.position desc,s.id limit 1) then current_state:='completed';end if;
  if previous_state is distinct from 'cancelled' and nullif(o->>'current_status_id','')::uuid=(select s.id from public.order_statuses s where s.company_id=co and not s.is_support_phase order by s.position desc,s.id limit 1) then previous_state:='completed';end if;
 end if;
 -- Explicit cancellation wins over a final custom phase still attached to the order.
 if prefix='order' then
  if lower(coalesce(n->>'status','')) in ('cancelled','canceled','annullato','annullata','annullati','cancellato','cancellata') or lower(coalesce(data->>'status_name','')) in ('cancelled','canceled','annullato','annullata','annullati','cancellato','cancellata') then current_state:='cancelled';end if;
  if lower(coalesce(o->>'status','')) in ('cancelled','canceled','annullato','annullata','annullati','cancellato','cancellata') then previous_state:='cancelled';end if;
 end if;
 if tg_table_name='invoice_payments' then
  if tg_op='INSERT' then perform private.enqueue_global_webhook(co,'payment.received',data);end if;return null;
 elsif tg_table_name='bank_payments' then
  if n->>'status' in ('failed','rejected') and (tg_op='INSERT' or n->>'status' is distinct from o->>'status') then perform private.enqueue_global_webhook(co,'payment.failed',data);end if;return null;
 end if;
 if prefix='contact' and (tg_op='DELETE' or n->>'deleted_at' is not null and o->>'deleted_at' is null) then
  perform private.enqueue_global_webhook(co,'contact.deleted',jsonb_build_object('id',n->'id','company_id',n->'company_id'));return null;
 end if;
 if tg_op='INSERT' then
  perform private.enqueue_global_webhook(co,prefix||'.created',data);
 elsif tg_op='UPDATE' and (n-'updated_at') is distinct from (o-'updated_at') then
  if prefix in ('contact','opportunity') and n->>'deleted_at' is null then perform private.enqueue_global_webhook(co,prefix||'.updated',data);end if;
  if prefix='opportunity' and n->>'stage_id' is distinct from o->>'stage_id' then
   perform private.enqueue_global_webhook(co,'opportunity.stage_changed',data||jsonb_build_object('previous_stage_id',o->'stage_id'));
  end if;
  if prefix='order' and (n->>'status' is distinct from o->>'status' or n->>'current_status_id' is distinct from o->>'current_status_id') then
   perform private.enqueue_global_webhook(co,'order.status_changed',data||jsonb_build_object('previous_status',o->'status'));
  end if;
  if prefix='appointment' and (n->>'appointment_date' is distinct from o->>'appointment_date' or n->>'appointment_time' is distinct from o->>'appointment_time') then
   perform private.enqueue_global_webhook(co,'appointment.rescheduled',data||jsonb_build_object('previous_date',o->'appointment_date','previous_time',o->'appointment_time'));
  end if;
 end if;
 if tg_op in ('INSERT','UPDATE') and (n->>'status' is distinct from o->>'status' or current_state is distinct from previous_state) then
  kind:=case
   when prefix='opportunity' and n->>'status' in ('won','lost') then prefix||'.'||(n->>'status')
   when prefix='order' and current_state in ('completed','completato','completata','concluso','conclusa','conclusi','completati','terminato','terminata','concluso_e_incassato') then 'order.completed'
   when prefix='order' and current_state in ('cancelled','canceled','annullato','annullata') then 'order.cancelled'
   when prefix in ('appointment','task') and n->>'status' in ('completed','completato','completata','done') then prefix||'.completed'
   when prefix='appointment' and n->>'status' in ('cancelled','canceled','annullato','annullata','cancellato','disdetto') then 'appointment.cancelled'
   else null end;
  if kind is not null then perform private.enqueue_global_webhook(co,kind,data);end if;
 end if;
 return null;
end $$;
revoke all on function private.global_webhook_record_event() from public,anon,authenticated;
do $triggers$ declare tab text;begin
 foreach tab in array array['marketing_contacts','marketing_opportunities','orders','appointments','tasks','invoice_payments','bank_payments'] loop
  execute format('drop trigger if exists global_webhook_record_event on public.%I',tab);
  execute format('create trigger global_webhook_record_event after insert or update or delete on public.%I for each row execute function private.global_webhook_record_event()',tab);
 end loop;
end $triggers$;

create or replace function public.claim_global_webhook_deliveries(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 -- Deadline changes generate a new logical event; one delivery per webhook/deadline.
 perform private.enqueue_global_webhook(t.company_id,'task.overdue',jsonb_build_object('id',t.id,'company_id',t.company_id,'due_date',t.due_date,'status',t.status),'task.overdue:'||t.id::text||':'||t.due_date::text)
 from public.tasks t where t.due_date<(now() at time zone 'Europe/Rome')::date and t.status not in ('completed','done','cancelled','canceled','completato','completata','annullato','annullata','cancellato')
 and exists(select 1 from public.webhooks w where w.company_id=t.company_id and w.is_active and w.paused_at is null and 'task.overdue'=any(w.events))
 and exists(select 1 from public.webhooks w where w.company_id=t.company_id and w.is_active and w.paused_at is null and 'task.overdue'=any(w.events) and not exists(select 1 from public.webhook_deliveries d where d.webhook_id=w.id and d.dedupe_key='task.overdue:'||t.id::text||':'||t.due_date::text))
 limit 100;
 update public.webhook_deliveries set status='failed',next_attempt_at=null,lease_token=null,lease_until=null,response_body='Tentativi esauriti dopo la scadenza della presa in carico'
 where delivery_source='global' and status='retrying' and attempt_in_cycle>=4 and lease_until<now();
 with due as (
  select d.id from public.webhook_deliveries d join public.webhooks w on w.id=d.webhook_id
  where d.delivery_source='global' and d.status in ('pending','retrying') and d.next_attempt_at<=now()
   and (d.lease_until is null or d.lease_until<now()) and d.attempt_in_cycle<4 and w.is_active and w.paused_at is null
  order by d.next_attempt_at,d.id for update of d skip locked limit greatest(1,least(coalesce(p_limit,20),50))
 ), leased as (
  update public.webhook_deliveries d set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempt_count=attempt_count+1,attempt_in_cycle=attempt_in_cycle+1,status='retrying',last_attempt_at=now()
  from due where due.id=d.id returning d.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'event_id',d.event_id,'occurred_at',d.occurred_at,'event_type',d.event_type,'payload',d.payload,'lease_token',d.lease_token,'url',w.url,'secret',w.secret,'timeout_seconds',w.timeout_seconds,'allowed_ips',w.allowed_ips)),'[]'::jsonb) into result from leased d join public.webhooks w on w.id=d.webhook_id;
 return result;
end $$;
revoke all on function public.claim_global_webhook_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_global_webhook_deliveries(integer) to service_role;

create or replace function public.finish_global_webhook_delivery(p_id uuid,p_lease uuid,p_success boolean,p_http integer,p_duration integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.webhook_deliveries%rowtype;
begin
 select * into d from public.webhook_deliveries where id=p_id and lease_token=p_lease for update;
 if not found then return false;end if;
 insert into private.global_webhook_attempts(delivery_id,lease_token,attempt_number,succeeded,http_status,duration_ms) values(d.id,p_lease,d.attempt_count,p_success,p_http,greatest(0,p_duration));
 update public.webhook_deliveries set status=case when p_success then 'success' when d.attempt_in_cycle>=4 then 'failed' else 'retrying' end,
  next_attempt_at=case when p_success or d.attempt_in_cycle>=4 then null else now()+case d.attempt_in_cycle when 1 then interval '5 minutes' when 2 then interval '15 minutes' else interval '60 minutes' end end,
  http_status=p_http,duration_ms=greatest(0,p_duration),response_body=case when p_http is null then 'Consegna non riuscita: rete, DNS o timeout' else 'HTTP '||p_http end,lease_token=null,lease_until=null where id=d.id;
 update public.webhooks set consecutive_failures=case when p_success then 0 else coalesce(consecutive_failures,0)+1 end,
  is_active=case when not p_success and coalesce(consecutive_failures,0)+1>=coalesce(max_consecutive_failures,20) then false else is_active end,
  paused_at=case when not p_success and coalesce(consecutive_failures,0)+1>=coalesce(max_consecutive_failures,20) then now() else paused_at end,
  paused_reason=case when not p_success and coalesce(consecutive_failures,0)+1>=coalesce(max_consecutive_failures,20) then 'too_many_failures' else paused_reason end where id=d.webhook_id;
 return true;
end $$;
revoke all on function public.finish_global_webhook_delivery(uuid,uuid,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.finish_global_webhook_delivery(uuid,uuid,boolean,integer,integer) to service_role;

create or replace function private.reset_global_webhook_pause() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.company_id is distinct from old.company_id then raise exception 'Un webhook non può cambiare azienda' using errcode='42501';end if;
 if new.is_active and not old.is_active then new.paused_at:=null;new.paused_reason:=null;new.consecutive_failures:=0;end if;return new;
end $$;
revoke all on function private.reset_global_webhook_pause() from public,anon,authenticated;
drop trigger if exists reset_global_webhook_pause on public.webhooks;
create trigger reset_global_webhook_pause before update on public.webhooks for each row execute function private.reset_global_webhook_pause();

create or replace function public.requeue_global_webhook_delivery(p_id uuid,p_webhook uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.webhook_deliveries d set delivery_source='global',event_id=coalesce(event_id,id),occurred_at=coalesce(occurred_at,created_at),status='pending',attempt_in_cycle=0,next_attempt_at=now(),lease_token=null,lease_until=null
 where d.id=p_id and d.webhook_id=p_webhook and d.status in ('failed','retrying') and (d.lease_until is null or d.lease_until<now())
 and exists(select 1 from public.webhooks w where w.id=d.webhook_id and w.is_active and w.paused_at is null);
 return found;
end $$;
revoke all on function public.requeue_global_webhook_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.requeue_global_webhook_delivery(uuid,uuid) to service_role;
