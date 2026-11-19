-- Nuovi tentativi separati dall'estrazione delle fatture: una categoria non blocca l'altra.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.email_opportunita_tentativi (
  email_id uuid primary key references public.email_inbox(id) on delete cascade,
  tentativi integer not null default 0 check (tentativi >= 0),
  errori_consecutivi integer not null default 0 check (errori_consecutivi >= 0),
  ultimo_esito text not null check (ultimo_esito in ('in_coda','credito','errore')),
  ultimo_errore text,
  prossimo_tentativo timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.email_opportunita_tentativi add column if not exists errori_consecutivi integer not null default 0 check (errori_consecutivi >= 0);
alter table public.email_opportunita_tentativi enable row level security;
revoke all on public.email_opportunita_tentativi from public, anon, authenticated;
grant all on public.email_opportunita_tentativi to service_role;

create or replace function public.email_opportunita_segna_tentativo(
  p_email_id uuid, p_esito text, p_errore text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_esito not in ('credito','errore') or p_esito is null then
    raise exception 'Esito del tentativo non valido';
  end if;
  insert into public.email_opportunita_tentativi as t
    (email_id,tentativi,errori_consecutivi,ultimo_esito,ultimo_errore,prossimo_tentativo,updated_at)
  values (p_email_id,1,case when p_esito='errore' then 1 else 0 end,p_esito,left(p_errore,300),now()+interval '1 hour',now())
  on conflict (email_id) do update set
    tentativi=t.tentativi+1,
    errori_consecutivi=case when p_esito='errore' then t.errori_consecutivi+1 else 0 end,
    ultimo_esito=excluded.ultimo_esito,
    ultimo_errore=excluded.ultimo_errore,
    prossimo_tentativo=now()+make_interval(mins => case when p_esito='credito' then 60
      else least(1440, (30 * power(2,least(t.errori_consecutivi+1,6)))::integer) end),
    updated_at=now();
end $$;
revoke all on function public.email_opportunita_segna_tentativo(uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_opportunita_segna_tentativo(uuid,text,text) to service_role;

create or replace function public.silvio_email_dispatch_opportunita(p_cron_secret text,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare rec record; v_n integer:=0; v_email uuid;
begin
  for rec in
    select e.id from public.email_inbox e
    where (e.categoria::text in ('preventivo','opportunita') or e.ai_category in ('preventivo','opportunita'))
      and coalesce(e.is_trashed,false)=false
      and not exists (select 1 from public.email_opportunita_bozza b where b.email_id=e.id)
      and not exists (select 1 from public.email_opportunita_tentativi t where t.email_id=e.id
        and (t.prossimo_tentativo>now() or t.errori_consecutivi>=6))
    order by e.received_at desc
    limit greatest(1,least(coalesce(p_limit,10),25))
  loop
    -- Lease prima dell'accodamento: due dispatcher non inviano due volte la stessa mail.
    v_email:=null;
    insert into public.email_opportunita_tentativi as t
      (email_id,ultimo_esito,prossimo_tentativo)
    values (rec.id,'in_coda',now()+interval '10 minutes')
    on conflict(email_id) do update set ultimo_esito='in_coda',
      prossimo_tentativo=excluded.prossimo_tentativo,updated_at=now()
    where t.prossimo_tentativo<=now() and t.errori_consecutivi<6
    returning email_id into v_email;
    if v_email is null then continue; end if;
    perform net.http_post(
      url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-ai-opportunita',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',p_cron_secret),
      body:=jsonb_build_object('email_id',rec.id),timeout_milliseconds:=15000);
    v_n:=v_n+1;
  end loop;
  return jsonb_build_object('dispatched',v_n);
end $$;
revoke all on function public.silvio_email_dispatch_opportunita(text,integer) from public,anon,authenticated;
grant execute on function public.silvio_email_dispatch_opportunita(text,integer) to service_role;

-- Raggruppare PRIMA del limite: le risposte 402 ripetute non nascondono gli altri guasti.
create or replace function public.admin_errori_raggruppati(
  p_ore integer default 48,p_origine text default null,p_limit integer default 100
) returns table (
  origine text,id text,avvenuto_il timestamptz,componente text,messaggio text,codice integer,
  azienda_id uuid,azienda_nome text,gravita text,categoria text,numero_eventi bigint,primo_evento timestamptz
) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not coalesce(public.is_super_admin(auth.uid()),false)
    and not coalesce(public.is_platform_staff(auth.uid()),false) then
    raise exception 'Accesso riservato allo staff di piattaforma' using errcode='42501';
  end if;
  return query
  with classificate as (
    select e.*,case when e.codice=402 and (
      e.messaggio like '%"insufficient_credits"%' or e.messaggio like '%"payment_method_required"%'
    ) then 'azione_richiesta' else 'errore_tecnico' end as categoria_evento
    from public.v_errori_piattaforma e
    where e.avvenuto_il>now()-make_interval(hours=>greatest(1,least(coalesce(p_ore,48),168)))
      and (p_origine is null or e.origine=p_origine)
  ), gruppi as (
    select e.origine,min(e.id) as id,max(e.avvenuto_il) as avvenuto_il,e.componente,e.messaggio,
      e.codice,e.azienda_id,e.gravita,e.categoria_evento,count(*) as numero_eventi,min(e.avvenuto_il) as primo_evento
    from classificate e
    group by e.origine,e.componente,e.messaggio,e.codice,e.azienda_id,e.gravita,e.categoria_evento
  )
  select g.origine,g.id,g.avvenuto_il,g.componente,g.messaggio,g.codice,g.azienda_id,c.name,
    g.gravita,g.categoria_evento,g.numero_eventi,g.primo_evento
  from gruppi g left join public.companies c on c.id=g.azienda_id
  order by (g.categoria_evento='errore_tecnico') desc,g.avvenuto_il desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end $$;
revoke all on function public.admin_errori_raggruppati(integer,text,integer) from public,anon;
grant execute on function public.admin_errori_raggruppati(integer,text,integer) to authenticated,service_role;
