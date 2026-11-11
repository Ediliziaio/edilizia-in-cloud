set local lock_timeout='3s';set local statement_timeout='60s';
create table if not exists public.automation_webhook_endpoints(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),flow_id uuid not null references public.automation_flows(id),name text not null check(length(name) between 3 and 100),secret_hash text not null check(secret_hash~'^[a-f0-9]{64}$'),is_active boolean not null default true,
 mapping_json jsonb not null default '{"entity_type":"contact","entity_id_path":"contact_id","payload_paths":{"message":"message"}}',created_at timestamptz not null default now(),created_by uuid not null
);
create index if not exists inbound_endpoint_company on public.automation_webhook_endpoints(company_id,created_at);
create index if not exists inbound_endpoint_flow on public.automation_webhook_endpoints(flow_id);
alter table public.automation_webhook_endpoints enable row level security;
revoke all on public.automation_webhook_endpoints from public,anon,authenticated;
grant select(id,company_id,flow_id,name,is_active,mapping_json,created_at,created_by) on public.automation_webhook_endpoints to authenticated;
grant all on public.automation_webhook_endpoints to service_role;
drop policy if exists inbound_webhook_read on public.automation_webhook_endpoints;
create policy inbound_webhook_read on public.automation_webhook_endpoints for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_settings_integrations',company_id) or public.has_permission_for_company((select auth.uid()),'can_view_automazioni',company_id));
create table if not exists public.automation_webhook_receipts(
 id uuid primary key default gen_random_uuid(),endpoint_id uuid not null references public.automation_webhook_endpoints(id),company_id uuid not null references public.companies(id),event_id text not null check(length(event_id) between 1 and 160),payload_sha256 text not null,is_test boolean not null default false,received_at timestamptz not null default now(),unique(endpoint_id,event_id,is_test)
);
create index if not exists inbound_receipt_company on public.automation_webhook_receipts(company_id,received_at);
alter table public.automation_webhook_receipts enable row level security;
revoke all on public.automation_webhook_receipts from public,anon,authenticated;
grant select on public.automation_webhook_receipts to authenticated;grant all on public.automation_webhook_receipts to service_role;
drop policy if exists inbound_webhook_receipt_read on public.automation_webhook_receipts;
create policy inbound_webhook_receipt_read on public.automation_webhook_receipts for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_settings_integrations',company_id));
create index if not exists inbound_receipt_rate_window on public.automation_webhook_receipts(endpoint_id,received_at);
create or replace function public.automation_accept_webhook(p_endpoint uuid,p_secret_hash text,p_event_id text,p_digest text,p_entity_id uuid,p_payload jsonb,p_test boolean default false,p_contact jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.automation_webhook_endpoints; old_digest text; co uuid; kind text; eid uuid:=p_entity_id; matched uuid[]; mail text; v_phone text; k text;
begin
 select * into e from public.automation_webhook_endpoints where id=p_endpoint and is_active and secret_hash=p_secret_hash for update;
 if not found then raise exception 'Webhook non autorizzato' using errcode='42501'; end if;
 if not exists(select 1 from public.automation_flows f where f.id=e.flow_id and f.company_id=e.company_id and f.deleted_at is null) then raise exception 'Automazione non disponibile'; end if;
 if p_event_id is null or length(p_event_id) not between 1 and 160 or p_digest !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload)<>'object' then raise exception 'Evento non valido'; end if;
 select payload_sha256 into old_digest from public.automation_webhook_receipts where endpoint_id=e.id and event_id=p_event_id and is_test=p_test;
 if found then
  if old_digest<>p_digest then raise exception 'Identificatore già usato per un evento diverso' using errcode='23505'; end if;
  return jsonb_build_object('accepted',true,'duplicate',true,'test',p_test);
 end if;
 if (select count(*) from public.automation_webhook_receipts where endpoint_id=e.id and received_at>now()-interval '1 minute')>=60 then raise exception 'Limite richieste raggiunto' using errcode='54000'; end if;
 kind:=e.mapping_json->>'entity_type';
 if kind not in ('contact','opportunity') or kind is null then raise exception 'Oggetto non supportato'; end if;
 if not p_test and e.mapping_json->>'entity_mode'='contact_upsert' then
  if kind<>'contact' then raise exception 'Upsert disponibile solo per contatti'; end if;
  mail:=nullif(lower(trim(p_contact->>'email')),'');v_phone:=nullif(trim(p_contact->>'phone'),'');
  if (mail is null and v_phone is null) or (mail is not null and (length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')) or (v_phone is not null and v_phone !~ '^[+][1-9][0-9]{7,14}$') then raise exception 'Identificazione contatto non valida'; end if;
  if length(coalesce(p_contact->>'first_name',''))>100 or length(coalesce(p_contact->>'last_name',''))>100 then raise exception 'Nome troppo lungo'; end if;
  -- Stable sorted identity locks serialize overlapping email/phone identifiers.
  for k in select x from unnest(array[case when mail is not null then 'email:'||mail end,case when v_phone is not null then 'phone:'||v_phone end]) x where x is not null order by x loop
   perform pg_advisory_xact_lock(hashtextextended(e.company_id::text||'|'||k,0));
  end loop;
  select array_agg(c.id) into matched from (select id from public.marketing_contacts where company_id=e.company_id and deleted_at is null and ((mail is not null and lower(trim(email))=mail) or (v_phone is not null and regexp_replace(marketing_contacts.phone,'[^0-9]','','g')=substring(v_phone from 2))) order by id for update) c;
  if cardinality(matched)>1 then raise exception 'Identificatori collegati a contatti diversi'; end if;
  eid:=matched[1];
  if eid is null then
   insert into public.marketing_contacts(company_id,first_name,last_name,email,phone,source,created_by) values(e.company_id,coalesce(p_contact->>'first_name',''),p_contact->>'last_name',mail,v_phone,'webhook',e.created_by) returning id into eid;
  else
   -- Fill missing identity fields only. Never clear opt-out/consent, tags or staff edits.
   update public.marketing_contacts set first_name=coalesce(nullif(first_name,''),p_contact->>'first_name',''),last_name=coalesce(nullif(last_name,''),p_contact->>'last_name'),email=coalesce(nullif(email,''),mail),phone=coalesce(nullif(marketing_contacts.phone,''),v_phone) where id=eid and company_id=e.company_id;
  end if;
 end if;
 if not p_test then
  execute format('select company_id from public.%I where id=$1',case when kind='contact' then 'marketing_contacts' else 'marketing_opportunities' end) into co using eid;
  if co is distinct from e.company_id then raise exception 'Record non disponibile per questa azienda'; end if;
 end if;
 insert into public.automation_webhook_receipts(endpoint_id,company_id,event_id,payload_sha256,is_test) values(e.id,e.company_id,p_event_id,p_digest,p_test);
 if not p_test then
  insert into public.automation_trigger_events(company_id,trigger_event,entity_id,entity_type,payload,dedup_key)
  values(e.company_id,'webhook_received',eid::text,kind,
   (p_payload-array['company_id','legacy_events','custom_field_flow_path','test_mode','dry_run','manual_flow_id','_webhook_flow_id','webhook_endpoint_id'])||jsonb_build_object('webhook_endpoint_id',e.id,'_webhook_flow_id',e.flow_id,'webhook_event_id',p_event_id),
   'inbound:'||e.id::text||':'||p_event_id);
 end if;
 return jsonb_build_object('accepted',true,'duplicate',false,'test',p_test);
end $$;
revoke all on function public.automation_accept_webhook(uuid,text,text,text,uuid,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.automation_accept_webhook(uuid,text,text,text,uuid,jsonb,boolean,jsonb) to service_role;
