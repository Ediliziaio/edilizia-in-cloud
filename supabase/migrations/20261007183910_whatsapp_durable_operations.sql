begin;
set local lock_timeout = '3s';

create table public.whatsapp_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  operation_key text not null check (length(operation_key) between 1 and 200),
  kind text not null check (kind in ('send','tool')),
  fingerprint text not null check (length(fingerprint) = 64),
  owner uuid not null,
  status text not null default 'running' check (status in ('running','completed','rejected','unknown')),
  phase text not null default 'reserved',
  context jsonb not null default '{}',
  result jsonb,
  credit_eur numeric check (credit_eur >= 0 and credit_eur::text not in ('NaN','Infinity','-Infinity')),
  provider_message_id text,
  delivery_status text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, kind, operation_key)
);
create index whatsapp_operations_review on public.whatsapp_operations(company_id, created_at desc)
  where status in ('running','unknown','rejected');
create index whatsapp_operations_provider on public.whatsapp_operations(provider_message_id) where provider_message_id is not null;
alter table public.whatsapp_operations enable row level security;
create policy whatsapp_operations_admin_read on public.whatsapp_operations for select to authenticated
  using (public.puo_gestire_whatsapp(company_id));
revoke all on public.whatsapp_operations from public, anon, authenticated;
grant select on public.whatsapp_operations to authenticated;
grant all on public.whatsapp_operations to service_role;

create or replace function public.whatsapp_operation_claim(p_company uuid, p_key text, p_kind text,
  p_fingerprint text, p_owner uuid, p_context jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.whatsapp_operations; inserted_id uuid;
begin
  insert into public.whatsapp_operations(company_id,operation_key,kind,fingerprint,owner,context)
    values(p_company,p_key,p_kind,p_fingerprint,p_owner,coalesce(p_context,'{}'))
    on conflict(company_id,kind,operation_key) do nothing returning id into inserted_id;
  select * into strict r from public.whatsapp_operations where company_id=p_company and kind=p_kind and operation_key=p_key for update;
  if r.fingerprint <> p_fingerprint then return jsonb_build_object('state','conflict'); end if;
  if inserted_id is not null then return jsonb_build_object('state','claimed','id',r.id); end if;
  return jsonb_build_object('state',r.status,'id',r.id,'result',r.result,'phase',r.phase);
end $$;

create or replace function public.whatsapp_operation_charge(p_id uuid, p_owner uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.whatsapp_operations; debit jsonb; blocked boolean;
begin
  select * into r from public.whatsapp_operations where id=p_id and owner=p_owner and kind='send' for update;
  if not found or r.status <> 'running' then raise exception 'operation_unavailable'; end if;
  if p_amount is null or p_amount < 0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_amount'; end if;
  if r.credit_eur is not null then return jsonb_build_object('success',true,'amount',r.credit_eur); end if;
  if p_amount > 0 then
    -- Same lock order as pool consumption/refunds; don't lock the wallet before the pool.
    perform 1 from public.company_credit_pool where company_id=r.company_id for update;
    select sends_blocked into blocked from public.whatsapp_credits where company_id=r.company_id for update;
    if blocked is true then return jsonb_build_object('success',false,'error','insufficient_credits'); end if;
    debit := public.consume_credits(r.company_id,'whatsapp',p_amount,'Invio WhatsApp',
      jsonb_build_object('whatsapp_operation_id',r.id,'operation_key',r.operation_key));
    if coalesce((debit->>'success')::boolean,false) is not true then return debit; end if;
  else debit := jsonb_build_object('success',true,'amount',0); end if;
  update public.whatsapp_operations set credit_eur=p_amount,phase='charged',updated_at=now() where id=r.id;
  return debit;
end $$;

create or replace function public.whatsapp_operation_finish(p_id uuid,p_owner uuid,p_status text,p_result jsonb,p_provider_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.whatsapp_operations; refund jsonb; balance_after numeric;
begin
  if p_status not in ('completed','rejected','unknown') then raise exception 'invalid_status'; end if;
  select * into r from public.whatsapp_operations where id=p_id and owner=p_owner and status='running' for update;
  if not found then return false; end if;
  if p_status='completed' and r.kind='send' and nullif(p_provider_id,'') is null then raise exception 'provider_id_required'; end if;
  -- Only a definitive rejection is refundable. State and refund commit together.
  if p_status='rejected' and r.kind='send' and r.credit_eur > 0 then
    refund := public.pool_ricarica(r.company_id,'whatsapp',r.credit_eur,'Rimborso invio WhatsApp rifiutato',
      jsonb_build_object('whatsapp_operation_id',r.id));
    balance_after := (refund->>'balance_after')::numeric;
    if balance_after is null then raise exception 'refund_not_confirmed'; end if;
    insert into public.whatsapp_credits_log(company_id,type,amount_eur,balance_before,balance_after,description,metadata)
      values(r.company_id,'refund',r.credit_eur,balance_after-r.credit_eur,balance_after,
        'Rimborso invio WhatsApp rifiutato',jsonb_build_object('whatsapp_operation_id',r.id));
  end if;
  update public.whatsapp_operations set status=p_status,result=p_result,provider_message_id=p_provider_id,
    phase=case when p_provider_id is not null then 'accepted' else p_status end,updated_at=now()
    where id=p_id and owner=p_owner and status='running';
  return found;
end $$;

create table public.whatsapp_conversation_locks (
  company_id uuid not null references public.companies(id) on delete cascade,
  number_id uuid not null references public.ai_whatsapp_numbers(id) on delete cascade,
  phone text not null,
  message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(company_id,number_id,phone)
);
alter table public.whatsapp_conversation_locks enable row level security;
revoke all on public.whatsapp_conversation_locks from public,anon,authenticated;
grant all on public.whatsapp_conversation_locks to service_role;

create or replace function public.whatsapp_conversation_claim(p_company uuid,p_number uuid,p_phone text,p_message uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_message uuid;
begin
  -- Only verified inbound scope can own a lock.
  if not exists(select 1 from public.whatsapp_messages where id=p_message and company_id=p_company
    and wa_number_id=p_number and from_phone=p_phone and direction='inbound' and processing_status='received') then return false; end if;
  if exists(select 1 from public.whatsapp_messages older join public.whatsapp_messages requested on requested.id=p_message
    where older.company_id=p_company and older.wa_number_id=p_number and older.from_phone=p_phone
      and older.direction='inbound' and older.processing_status in ('received','processing')
      and (older.created_at,older.id) < (requested.created_at,requested.id)) then return false; end if;
  insert into public.whatsapp_conversation_locks(company_id,number_id,phone,message_id)
    values(p_company,p_number,p_phone,p_message) on conflict do nothing;
  select message_id into current_message from public.whatsapp_conversation_locks
    where company_id=p_company and number_id=p_number and phone=p_phone for update;
  if current_message=p_message then return true; end if;
  if exists(select 1 from public.whatsapp_messages where id=current_message and processing_status in ('processed','failed','failed_max_retries')) then
    update public.whatsapp_conversation_locks set message_id=p_message,created_at=now()
      where company_id=p_company and number_id=p_number and phone=p_phone;
    return true;
  end if;
  -- Failed/unknown workers require review; never steal a potentially live write.
  return false;
end $$;

create or replace function public.whatsapp_conversation_release(p_message uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.whatsapp_conversation_locks l where message_id=p_message
    and exists(select 1 from public.whatsapp_messages m where m.id=p_message and m.processing_status in ('processed','failed'));
  return found;
end $$;

create or replace function public.whatsapp_operation_review(p_company uuid,p_id uuid,p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.puo_gestire_whatsapp(p_company) or auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(coalesce(p_note,''))) < 5 then raise exception 'review_note_required'; end if;
  update public.whatsapp_operations set reviewed_at=now(),reviewed_by=auth.uid(),review_note=left(p_note,1000),updated_at=now()
    where id=p_id and company_id=p_company and status in ('unknown','rejected');
  -- Review records evidence; it does not change an unknown send into success or resend it.
  return found;
end $$;

revoke all on function public.whatsapp_operation_claim(uuid,text,text,text,uuid,jsonb),
  public.whatsapp_operation_charge(uuid,uuid,numeric),public.whatsapp_operation_finish(uuid,uuid,text,jsonb,text),
  public.whatsapp_conversation_claim(uuid,uuid,text,uuid),public.whatsapp_conversation_release(uuid)
  from public,anon,authenticated;
grant execute on function public.whatsapp_operation_claim(uuid,text,text,text,uuid,jsonb),
  public.whatsapp_operation_charge(uuid,uuid,numeric),public.whatsapp_operation_finish(uuid,uuid,text,jsonb,text),
  public.whatsapp_conversation_claim(uuid,uuid,text,uuid),public.whatsapp_conversation_release(uuid) to service_role;
revoke all on function public.whatsapp_operation_review(uuid,uuid,text) from public,anon;
grant execute on function public.whatsapp_operation_review(uuid,uuid,text) to authenticated;
create or replace function public.whatsapp_message_review(p_company uuid,p_message uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.puo_gestire_whatsapp(p_company) or auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  update public.whatsapp_messages set metadata=coalesce(metadata,'{}'::jsonb) ||
    jsonb_build_object('manually_reviewed_at',now(),'manually_reviewed_by',auth.uid())
    where id=p_message and company_id=p_company and processing_status not in ('received','processing');
  return found;
end $$;
revoke all on function public.whatsapp_message_review(uuid,uuid) from public,anon;
grant execute on function public.whatsapp_message_review(uuid,uuid) to authenticated;
commit;
