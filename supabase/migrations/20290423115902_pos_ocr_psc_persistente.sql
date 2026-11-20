-- Lettura persistente del PSC. L'edge verifica i permessi e la fonte; solo service_role accede ai testi.
create table public.pos_ocr_letture (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  richiesto_da uuid references auth.users(id) on delete set null,
  documento_id uuid not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  revisione text not null,
  stato text not null default 'in_coda' check (stato in ('in_coda', 'in_lettura', 'pronta', 'parziale', 'errore')),
  pagine_totali int check (pagine_totali between 1 and 9999),
  tentativi int not null default 0,
  ciclo_riprova int not null default 0,
  token uuid,
  lease_fino timestamptz,
  errore text,
  aggiornata_il timestamptz not null default now(),
  unique(company_id, order_id, documento_id, sha256, revisione)
);

create table public.pos_ocr_pagine (
  lettura_id uuid not null references public.pos_ocr_letture(id) on delete cascade,
  pagina int not null check (pagina between 1 and 9999),
  metodo text not null check (metodo in ('native', 'ocr', 'blank', 'unreadable', 'riprova')),
  testo text not null default '' check (char_length(testo) <= 24000),
  primary key (lettura_id, pagina)
);

create index pos_ocr_letture_coda on public.pos_ocr_letture (aggiornata_il, id) where stato in ('in_coda','in_lettura');
alter table public.pos_ocr_letture enable row level security;
alter table public.pos_ocr_pagine enable row level security;
revoke all on public.pos_ocr_letture, public.pos_ocr_pagine from public, anon, authenticated;
grant select, insert, update, delete on public.pos_ocr_letture, public.pos_ocr_pagine to service_role;

create function public.pos_ocr_prendi(_id uuid default null)
returns setof public.pos_ocr_letture
language sql security invoker set search_path = ''
as $$
  with scelta as (
    select l.id from public.pos_ocr_letture l
    where (_id is null or l.id = _id)
      and (l.stato = 'in_coda' or (l.stato = 'in_lettura' and l.lease_fino < now()))
    order by l.aggiornata_il, l.id
    limit 1 for update skip locked
  )
  update public.pos_ocr_letture l
  set stato = case when l.tentativi >= 3 then 'errore' else 'in_lettura' end,
      errore = case when l.tentativi >= 3 then 'Elaborazione interrotta. Puoi riprendere dalle pagine mancanti.' end,
      token = gen_random_uuid(), lease_fino = now() + interval '2 minutes',
      tentativi = l.tentativi + 1, aggiornata_il = now()
  from scelta where l.id = scelta.id returning l.*;
$$;

create function public.pos_ocr_salva(_id uuid, _token uuid, _totali int, _pagine jsonb, _errore text default null)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  l public.pos_ocr_letture;
  esito text;
begin
  select * into l from public.pos_ocr_letture where id = _id and token = _token
    and stato = 'in_lettura' and lease_fino > now() for update;
  if not found then return null; end if;
  if _errore is not null then
    update public.pos_ocr_letture set stato = 'errore', errore = left(_errore, 350),
      token = null, lease_fino = null, aggiornata_il = now() where id = _id;
    return 'errore';
  end if;
  if _totali is null or _totali not between 1 and 9999 or (l.pagine_totali is not null and l.pagine_totali <> _totali)
    or jsonb_typeof(_pagine) <> 'array' or jsonb_array_length(_pagine) not between 1 and 8 then
    raise exception 'Risultati OCR non validi';
  end if;
  insert into public.pos_ocr_pagine(lettura_id, pagina, metodo, testo)
    select _id, p.pagina, p.metodo, coalesce(p.testo, '')
    from jsonb_to_recordset(_pagine) as p(pagina int, metodo text, testo text)
    where p.pagina between 1 and _totali and p.metodo in ('native','ocr','blank','unreadable')
  on conflict (lettura_id,pagina) do update set metodo = excluded.metodo, testo = excluded.testo
    where public.pos_ocr_pagine.metodo = 'riprova';
  if (select count(*) from public.pos_ocr_pagine where lettura_id = _id and metodo <> 'riprova') < _totali then
    esito := 'in_coda';
  elsif exists(select 1 from public.pos_ocr_pagine where lettura_id = _id and metodo = 'unreadable') then
    esito := 'parziale';
  else
    esito := 'pronta';
  end if;
  update public.pos_ocr_letture set pagine_totali = _totali, stato = esito, tentativi = 0,
    token = null, lease_fino = null, errore = null, aggiornata_il = now() where id = _id;
  return esito;
end;
$$;

create function public.pos_ocr_riprova(_id uuid, _azienda uuid, _autore uuid)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  perform 1 from public.pos_ocr_letture
    where id = _id and company_id = _azienda and stato in ('errore','parziale') for update;
  if not found then return false; end if;
  update public.pos_ocr_pagine set metodo = 'riprova' where lettura_id = _id and metodo = 'unreadable';
  update public.pos_ocr_letture set stato = 'in_coda', richiesto_da = _autore, tentativi = 0, ciclo_riprova = ciclo_riprova + 1,
    token = null, lease_fino = null, errore = null, aggiornata_il = now() where id = _id;
  return true;
end;
$$;

revoke all on function public.pos_ocr_prendi(uuid), public.pos_ocr_salva(uuid,uuid,int,jsonb,text),
  public.pos_ocr_riprova(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.pos_ocr_prendi(uuid), public.pos_ocr_salva(uuid,uuid,int,jsonb,text),
  public.pos_ocr_riprova(uuid,uuid,uuid) to service_role;

-- Recupera anche un lavoro abbandonato da un worker, senza richiedere un browser aperto.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null
    and to_regprocedure('public.silvio_invoke_edge(text,jsonb)') is not null then
    perform cron.schedule('pos-ocr-psc', '* * * * *', $cron$
      select public.silvio_invoke_edge('genera-pos', '{"azione":"psc_ocr_giro"}'::jsonb)
      where exists (select 1 from public.pos_ocr_letture where stato = 'in_coda'
        or (stato = 'in_lettura' and lease_fino < now()));
    $cron$);
  end if;
end $$;

create function public.pos_ocr_riepilogo(_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'stato', l.stato, 'totale', l.pagine_totali, 'errore', l.errore,
    'esaminate', count(p.pagina) filter (where p.metodo <> 'riprova'),
    'letto', count(p.pagina) filter (where p.metodo in ('native','ocr')),
    'bianche', count(p.pagina) filter (where p.metodo = 'blank'),
    'illeggibili', coalesce(jsonb_agg(p.pagina order by p.pagina) filter (where p.metodo = 'unreadable'), '[]'::jsonb)
  )
  from public.pos_ocr_letture l left join public.pos_ocr_pagine p on p.lettura_id=l.id
  where l.id = _id group by l.id;
$$;

create function public.pos_ocr_estratti(_id uuid, _ricerca text)
returns table(pagina int, testo text, metodo text)
language sql stable security invoker set search_path = ''
as $$
  select p.pagina, left(p.testo, 5000), p.metodo
  from public.pos_ocr_pagine p
  where p.lettura_id = _id and p.metodo in ('native','ocr')
  order by ts_rank_cd(to_tsvector('italian', p.testo), to_tsquery('italian', coalesce(nullif(_ricerca,''),'prescrizioni | emergenze'))) desc, p.pagina
  limit 36;
$$;

revoke all on function public.pos_ocr_riepilogo(uuid), public.pos_ocr_estratti(uuid,text) from public, anon, authenticated;
grant execute on function public.pos_ocr_riepilogo(uuid), public.pos_ocr_estratti(uuid,text) to service_role;
