-- L'arruolamento manuale legge blocchi deterministici e accoda ogni blocco in
-- una transazione. Le iscrizioni preparate su bozze attendono la conferma.
create or replace function public.outreach_candidati_lista(
  p_sequence uuid, p_after uuid, p_list uuid, p_tag text, p_source text,
  p_province text, p_city text, p_ids uuid[]
)
returns table (
  id uuid, email text, optout_email boolean, unsubscribed boolean,
  opt_out boolean, ricontatta_dopo timestamptz, iscritto boolean
)
language sql stable security invoker set search_path = '' as $$
  select c.id,c.email,c.optout_email,c.unsubscribed,c.opt_out,c.ricontatta_dopo,
    exists(select 1 from public.outreach_enrollments e
      where e.sequence_id=p_sequence and e.contact_id=c.id and e.company_id=c.company_id)
  from public.marketing_contacts c
  where c.company_id='00000000-0000-0000-0000-000000000001' and c.deleted_at is null
    and c.id>coalesce(p_after,'00000000-0000-0000-0000-000000000000'::uuid)
    and (p_ids is null or c.id=any(p_ids))
    and (p_tag is null or c.tags @> array[p_tag])
    and (p_source is null or c.source=p_source)
    and (p_province is null or c.province ilike p_province)
    and (p_city is null or c.city ilike p_city)
    and (p_list is null or exists(
      select 1 from public.marketing_contact_list_members m
      join public.marketing_contact_lists l on l.id=m.list_id and l.company_id=c.company_id
      where m.list_id=p_list and m.contact_id=c.id
    ))
  order by c.id
  limit 501;
$$;

create or replace function public.outreach_accoda_iscrizioni(
  p_sequence uuid, p_brand uuid, p_step integer, p_stato text, p_candidates jsonb
)
returns uuid[] language plpgsql volatile security invoker set search_path = '' as $$
declare
  s public.outreach_sequences%rowtype;
  passo public.outreach_sequence_steps%rowtype;
  inseriti uuid[];
begin
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>500 then
    raise exception 'Blocco iscrizioni non valido';
  end if;
  select * into s from public.outreach_sequences
    where id=p_sequence and company_id='00000000-0000-0000-0000-000000000001' for update;
  if not found or s.status='archived' or s.brand_id is distinct from p_brand or p_brand is null
      or (s.status='active' and p_stato is distinct from 'active') then
    raise exception 'Sequenza modificata. Riapri la lista per riprovare.';
  end if;
  select * into passo from public.outreach_sequence_steps
    where sequence_id=s.id and channel='email' order by step_order limit 1;
  if not found or passo.step_order is distinct from p_step
      or nullif(btrim(passo.subject),'') is null or nullif(btrim(passo.body),'') is null then
    raise exception 'Primo passaggio email modificato. Riprova dalla sequenza.';
  end if;

  with nuovi as (
    insert into public.outreach_enrollments
      (company_id,sequence_id,contact_id,status,stop_reason,current_step,next_action_at)
    select s.company_id,s.id,c.id,
      case when s.status='active' then 'active' else 'paused' end,
      case when s.status='active' then null else 'attesa_attivazione' end,
      passo.step_order,x.quando
    from (
      select distinct on (id) id,email,quando
      from jsonb_to_recordset(p_candidates) as r(id uuid,email text,quando timestamptz)
      order by id,quando
    ) x
    join public.marketing_contacts c on c.id=x.id and c.company_id=s.company_id
    where c.deleted_at is null and lower(btrim(c.email))=lower(btrim(x.email))
      and x.quando is not null
      and not (coalesce(c.optout_email,false) or coalesce(c.unsubscribed,false) or coalesce(c.opt_out,false))
      and (c.ricontatta_dopo is null or c.ricontatta_dopo<=now())
      and not exists(select 1 from public.email_suppressions b
        where b.company_id=s.company_id and b.email_normalized=lower(btrim(c.email)))
      and not exists(select 1 from public.outreach_enrollments e
        where e.sequence_id=s.id and e.contact_id=c.id)
    returning id,contact_id,next_action_at
  ), accodati as (
    insert into public.outreach_send_queue
      (company_id,enrollment_id,contact_id,brand_id,channel,to_email,subject,body,status,scheduled_for,primo_contatto)
    select s.company_id,n.id,n.contact_id,p_brand,'email',c.email,coalesce(passo.subject,''),
      coalesce(passo.body,''),'queued',n.next_action_at,true
    from nuovi n join public.marketing_contacts c on c.id=n.contact_id
    returning contact_id
  )
  select coalesce(array_agg(contact_id),array[]::uuid[]) into inseriti from accodati;

  if cardinality(inseriti)>0 then
    perform public.outreach_marca_in_sequenza(inseriti,p_brand);
  end if;
  return inseriti;
end
$$;

revoke all on function public.outreach_candidati_lista(uuid,uuid,uuid,text,text,text,text,uuid[]),
  public.outreach_accoda_iscrizioni(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.outreach_candidati_lista(uuid,uuid,uuid,text,text,text,text,uuid[]),
  public.outreach_accoda_iscrizioni(uuid,uuid,integer,text,jsonb) to service_role;

create or replace function public.outreach_telefono_csv(p_phone text)
returns text language sql immutable strict parallel safe set search_path = '' as $$
  select case when n ~ '^[1-9][0-9]{7,14}$' then n end
  from (
    select case
      when btrim(p_phone) like '+%' then d
      when d like '00%' then substr(d,3)
      when d ~ '^(3[0-9]{8,9}|0[0-9]{6,10})$' then '39'||d
      else d end n
    from (select regexp_replace(p_phone,'[^0-9]','','g') d) cifre
  ) normalizzato
  where btrim(p_phone) ~ '^\+?[0-9 ().-]+$';
$$;

create index if not exists idx_outreach_contatti_email_csv
  on public.marketing_contacts(lower(btrim(email)))
  where company_id='00000000-0000-0000-0000-000000000001' and email is not null;
create index if not exists idx_outreach_contatti_telefono_csv
  on public.marketing_contacts(public.outreach_telefono_csv(phone))
  where company_id='00000000-0000-0000-0000-000000000001' and phone is not null;

create or replace function public.outreach_importa_contatti(p_company uuid,p_tag text,p_rows jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  r jsonb;
  tag text := nullif(btrim(p_tag),'');
  mail text;
  tel text;
  corrispondenze uuid[];
  persona public.marketing_contacts%rowtype;
  importati integer := 0;
  riusati integer := 0;
  conflitti integer := 0;
  non_validi integer := 0;
begin
  if p_company is distinct from '00000000-0000-0000-0000-000000000001'::uuid or auth.uid() is null
     or not public.is_super_admin() or public.utente_bloccato() then
    raise exception 'Accesso alla console marketing negato' using errcode = '42501';
  end if;
  if tag is null or length(tag)>200 or jsonb_typeof(p_rows) is distinct from 'array'
      or jsonb_array_length(p_rows)>200 then
    raise exception 'Lista o blocco CSV non valido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outreach-import:'||p_company::text,0));
  for r in select value from jsonb_array_elements(p_rows) loop
    mail := nullif(lower(btrim(r->>'email')),'');
    tel := public.outreach_telefono_csv(r->>'phone');
    if mail is null and tel is null then
      non_validi := non_validi+1;
      continue;
    end if;

    select array_agg(id) into corrispondenze
    from (
      select id from public.marketing_contacts
        where company_id=p_company and email is not null and lower(btrim(email))=mail
      union
      select id from public.marketing_contacts
        where company_id=p_company and phone is not null and public.outreach_telefono_csv(phone)=tel
    ) identita;

    if cardinality(corrispondenze)>1 then
      conflitti := conflitti+1;
    elsif cardinality(corrispondenze)=1 then
      select * into persona from public.marketing_contacts
        where id=corrispondenze[1] and company_id=p_company for update;
      if not found or persona.deleted_at is not null
         or (mail is not null and nullif(btrim(persona.email),'') is not null and lower(btrim(persona.email))<>mail)
         or (tel is not null and public.outreach_telefono_csv(persona.phone) is not null
             and public.outreach_telefono_csv(persona.phone)<>tel) then
        conflitti := conflitti+1;
        continue;
      end if;
      update public.marketing_contacts set tags=array_append(coalesce(tags,array[]::text[]),tag)
        where id=persona.id and company_id=p_company and not coalesce(tags @> array[tag],false);
      riusati := riusati+1;
    else
      begin
        insert into public.marketing_contacts
          (company_id,first_name,last_name,email,phone,company_name,city,province,website,vat_number,notes,tags,source,last_activity_at)
        values (p_company,coalesce(nullif(r->>'first_name',''),'Lead'),r->>'last_name',mail,'+'||tel,r->>'company_name',
          r->>'city',r->>'province',r->>'website',r->>'vat_number',r->>'notes',array[tag],'csv_import',now());
        importati := importati+1;
      exception when unique_violation then
        conflitti := conflitti+1;
      when check_violation or string_data_right_truncation then
        non_validi := non_validi+1;
      end;
    end if;
  end loop;
  return jsonb_build_object('importati',importati,'riusati',riusati,'conflitti',conflitti,'non_validi',non_validi);
end
$$;

revoke all on function public.outreach_importa_contatti(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.outreach_importa_contatti(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
