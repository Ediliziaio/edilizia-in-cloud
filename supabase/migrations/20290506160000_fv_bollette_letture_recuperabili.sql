-- Risultati recuperabili della lettura, separati dalle modifiche del preventivo.
-- Il server conserva un esito; solo il wizard integra e conferma i dati letti.
set local lock_timeout='3s';
set local statement_timeout='30s';
create table if not exists public.fv_bollette_letture (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  progetto_id uuid not null references public.fv_progetti(id) on delete cascade,
  path text not null,
  nome text not null check(length(nome) between 1 and 200),
  versione integer not null default 1 check(versione>0),
  created_by uuid not null,
  stato text not null check(stato in ('in_corso','completata','fallita')),
  token uuid not null,
  scade_il timestamptz not null,
  documenti jsonb,
  errore text,
  http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(progetto_id,path,versione),
  check(path ~ ('^'||company_id::text||'/'||progetto_id::text||'/[a-f0-9]{64}\.(pdf|png|jpg|webp)$')),
  check(documenti is null or (jsonb_typeof(documenti)='array' and pg_column_size(documenti)<=900000))
);
create index if not exists fv_bollette_letture_progetto on public.fv_bollette_letture(company_id,progetto_id,updated_at desc);
alter table public.fv_bollette_letture enable row level security;
revoke all on public.fv_bollette_letture from public,anon,authenticated;
grant all on public.fv_bollette_letture to service_role;
grant select(id,company_id,progetto_id,path,nome,versione,stato,scade_il,documenti,errore,http_status,created_at,updated_at) on public.fv_bollette_letture to authenticated;
drop policy if exists fv_bollette_letture_visibili on public.fv_bollette_letture;
create policy fv_bollette_letture_visibili on public.fv_bollette_letture for select to authenticated using(
  exists(select 1 from public.fv_progetti p where p.id=fv_bollette_letture.progetto_id and p.company_id=fv_bollette_letture.company_id and p.deleted_at is null)
  and public.fv_bollette_accesso(path,false)
);

create or replace function public.fv_bolletta_prendi_lavoro(p_progetto uuid,p_path text,p_nome text,p_user uuid,p_token uuid,p_riprova boolean default false,p_versione integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fv_progetti%rowtype; lavoro public.fv_bollette_letture%rowtype;
begin
  select * into p from public.fv_progetti where id=p_progetto and deleted_at is null;
  if not found or p.stato::text not in ('bozza','configurato') then raise exception 'Il preventivo non è modificabile' using errcode='PT409'; end if;
  if p_user is null or p_token is null or p_versione<1 or p_nome is null or length(p_nome) not between 1 and 200 or p_path is null
    or p_path !~ ('^'||p.company_id::text||'/'||p.id::text||'/[a-f0-9]{64}\.(pdf|png|jpg|webp)$') then
    raise exception 'Richiesta di lettura non valida' using errcode='22023';
  end if;
  insert into public.fv_bollette_letture(company_id,progetto_id,path,nome,versione,created_by,stato,token,scade_il)
  values(p.company_id,p.id,p_path,p_nome,p_versione,p_user,'in_corso',p_token,clock_timestamp()+interval '4 minutes')
  on conflict(progetto_id,path,versione) do update set
    nome=excluded.nome,created_by=excluded.created_by,stato='in_corso',token=excluded.token,scade_il=excluded.scade_il,
    documenti=null,errore=null,http_status=null,updated_at=clock_timestamp()
  where (fv_bollette_letture.stato='in_corso' and fv_bollette_letture.scade_il<clock_timestamp())
    or (coalesce(p_riprova,false) and fv_bollette_letture.stato in ('fallita','completata'))
  returning * into lavoro;
  if found then return to_jsonb(lavoro)||'{"avviata":true}'::jsonb; end if;
  select * into lavoro from public.fv_bollette_letture where progetto_id=p.id and path=p_path and versione=p_versione;
  return (to_jsonb(lavoro)-'token'-'created_by')||'{"avviata":false}'::jsonb;
end $$;
revoke all on function public.fv_bolletta_prendi_lavoro(uuid,text,text,uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.fv_bolletta_prendi_lavoro(uuid,text,text,uuid,uuid,boolean,integer) to service_role;

create or replace function public.fv_bolletta_concludi_lavoro(p_id uuid,p_token uuid,p_status integer,p_esito jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; ok boolean;
begin
  ok:=case when jsonb_typeof(p_esito->'documenti')='array' then p_status between 200 and 299 and jsonb_array_length(p_esito->'documenti') between 1 and 20 else false end;
  update public.fv_bollette_letture set stato=case when coalesce(ok,false) then 'completata' else 'fallita' end,
    documenti=case when coalesce(ok,false) then p_esito->'documenti' end,
    errore=case when coalesce(ok,false) then null else left(coalesce(nullif(p_esito->>'error',''),'Lettura non riuscita. Riprova tra poco.'),1000) end,
    http_status=p_status,updated_at=clock_timestamp()
  where id=p_id and token=p_token and stato='in_corso' and scade_il>clock_timestamp();
  get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.fv_bolletta_concludi_lavoro(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.fv_bolletta_concludi_lavoro(uuid,uuid,integer,jsonb) to service_role;
