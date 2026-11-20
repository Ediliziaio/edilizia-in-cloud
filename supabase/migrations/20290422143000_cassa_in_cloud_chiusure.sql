set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.cassa_in_cloud_scontrini
  add column if not exists cassa_id text,
  add column if not exists fatture jsonb not null default '[]'::jsonb;

alter table public.cassa_in_cloud_punti_vendita
  add column if not exists sync_attivo boolean not null default false,
  add column if not exists prossimo_sync timestamptz,
  add column if not exists ultimo_sync timestamptz,
  add column if not exists errore_sync text,
  add column if not exists webhook_id uuid not null default gen_random_uuid();

create unique index if not exists cassa_in_cloud_webhook_id
  on public.cassa_in_cloud_punti_vendita(webhook_id);
create index if not exists cassa_in_cloud_sync_in_attesa
  on public.cassa_in_cloud_punti_vendita(prossimo_sync) where sync_attivo;
create index if not exists cassa_in_cloud_scontrini_per_cassa
  on public.cassa_in_cloud_scontrini(company_id, punto_vendita_id, data, cassa_id);

create table if not exists public.cassa_in_cloud_chiusure (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  punto_vendita_id text not null,
  punto_vendita_nome text not null,
  esterno_id text not null,
  cassa_id text,
  giorno date not null,
  data_chiusura date not null,
  valuta text,
  dati jsonb not null check (jsonb_typeof(dati) = 'object'),
  presente_in_cassa boolean not null default true,
  unique (company_id, punto_vendita_id, esterno_id)
);

create index if not exists cassa_in_cloud_chiusure_per_data
  on public.cassa_in_cloud_chiusure(company_id, giorno, punto_vendita_id, cassa_id);
create index if not exists cassa_in_cloud_chiusure_per_import
  on public.cassa_in_cloud_chiusure(company_id, punto_vendita_id, data_chiusura);

alter table public.cassa_in_cloud_chiusure enable row level security;
revoke all on public.cassa_in_cloud_chiusure from public, anon, authenticated;
grant select on public.cassa_in_cloud_chiusure to authenticated;
grant select, insert, update, delete on public.cassa_in_cloud_chiusure to service_role;
drop policy if exists cassa_in_cloud_chiusure_leggi on public.cassa_in_cloud_chiusure;
create policy cassa_in_cloud_chiusure_leggi on public.cassa_in_cloud_chiusure for select to authenticated
using (
  not (select public.utente_bloccato())
  and public.has_permission_for_company((select auth.uid()), 'can_view_billing', company_id)
);

create table if not exists public.cassa_in_cloud_eventi (
  company_id uuid not null references public.companies(id) on delete cascade,
  punto_vendita_id text not null,
  giorno date not null,
  richiesto_il timestamptz not null default clock_timestamp(),
  primary key (company_id, punto_vendita_id, giorno),
  foreign key (company_id, punto_vendita_id) references public.cassa_in_cloud_punti_vendita(company_id, punto_vendita_id) on delete cascade
);

create table if not exists public.cassa_in_cloud_webhooks (
  company_id uuid not null references public.companies(id) on delete cascade,
  punto_vendita_id text not null,
  entita text not null check (entita in ('RECEIPT', 'RECONCILIATION', 'INVOICE')),
  chiave_id uuid not null unique,
  primary key (company_id, punto_vendita_id, entita),
  foreign key (company_id, punto_vendita_id) references public.cassa_in_cloud_punti_vendita(company_id, punto_vendita_id) on delete cascade
);

alter table public.cassa_in_cloud_eventi enable row level security;
alter table public.cassa_in_cloud_webhooks enable row level security;
revoke all on public.cassa_in_cloud_eventi, public.cassa_in_cloud_webhooks from public, anon, authenticated;
grant select, insert, update, delete on public.cassa_in_cloud_eventi, public.cassa_in_cloud_webhooks to service_role;

drop trigger if exists cassa_in_cloud_rimuovi_segreto_webhook on public.cassa_in_cloud_webhooks;
create trigger cassa_in_cloud_rimuovi_segreto_webhook after delete on public.cassa_in_cloud_webhooks
for each row execute function public.cassa_in_cloud_rimuovi_chiave();

create or replace function public.cassa_in_cloud_imposta_webhook(
  p_company_id uuid, p_punto_vendita_id text, p_entita text, p_segreto text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_chiave_id uuid;
begin
  perform 1 from public.cassa_in_cloud_punti_vendita
   where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id for update;
  if not found then raise exception 'Punto vendita scollegato'; end if;
  select chiave_id into v_chiave_id from public.cassa_in_cloud_webhooks
   where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id and entita = p_entita;
  if p_segreto is null then
    delete from public.cassa_in_cloud_webhooks
     where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id and entita = p_entita;
  elsif exists(select 1 from vault.secrets where id = v_chiave_id) then
    perform vault.update_secret(v_chiave_id, p_segreto);
  else
    insert into public.cassa_in_cloud_webhooks(company_id, punto_vendita_id, entita, chiave_id)
    values (p_company_id, p_punto_vendita_id, p_entita, vault.create_secret(p_segreto, null, 'Firma webhook Cassa in Cloud'))
    on conflict (company_id, punto_vendita_id, entita) do update set chiave_id = excluded.chiave_id;
  end if;
end $$;

create or replace function public.cassa_in_cloud_leggi_webhook(p_webhook_id uuid, p_entita text)
returns table(company_id uuid, punto_vendita_id text, sync_attivo boolean, segreto text)
language sql stable security definer set search_path = '' as $$
  select c.company_id, c.punto_vendita_id, c.sync_attivo, s.decrypted_secret
  from public.cassa_in_cloud_punti_vendita c
  join public.cassa_in_cloud_webhooks h using (company_id, punto_vendita_id)
  join vault.decrypted_secrets s on s.id = h.chiave_id
  join public.companies a on a.id = c.company_id and a.deleted_at is null
  where c.webhook_id = p_webhook_id and h.entita = p_entita;
$$;

create or replace function public.cassa_in_cloud_accoda_giorni(
  p_company_id uuid, p_punto_vendita_id text, p_giorni date[]
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if cardinality(p_giorni) not between 1 and 62 then return; end if;
  update public.cassa_in_cloud_punti_vendita set prossimo_sync = least(prossimo_sync, now())
   where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id and sync_attivo
      and coalesce(import_scade <= now(), true) and errore_sync is null;
  perform 1 from public.cassa_in_cloud_punti_vendita c
   where c.company_id = p_company_id and c.punto_vendita_id = p_punto_vendita_id and c.sync_attivo
   for key share;
  if not found then return; end if;
  -- Un evento nuovo resta da elaborare anche se arriva durante un import.
  insert into public.cassa_in_cloud_eventi(company_id, punto_vendita_id, giorno)
  select distinct p_company_id, p_punto_vendita_id, giorno
    from unnest(p_giorni) giorno where giorno <= (now() at time zone 'Europe/Rome')::date
  on conflict (company_id, punto_vendita_id, giorno)
    do update set richiesto_il = clock_timestamp();
end $$;

create or replace function public.cassa_in_cloud_prossimi_sync()
returns table(company_id uuid, punto_vendita_id text)
language sql security definer set search_path = '' as $$
  with prossimi as (
    select c.company_id, c.punto_vendita_id
    from public.cassa_in_cloud_punti_vendita c
    join public.companies a on a.id = c.company_id and a.deleted_at is null
    where c.sync_attivo and c.prossimo_sync <= now()
      and coalesce(c.import_scade <= now(), true)
    order by c.prossimo_sync
    limit 4
    for update of c skip locked
  )
  update public.cassa_in_cloud_punti_vendita c set prossimo_sync = now() + interval '30 minutes'
  from prossimi p where c.company_id = p.company_id and c.punto_vendita_id = p.punto_vendita_id
  returning c.company_id, c.punto_vendita_id;
$$;

-- L'import originale conserva le proprie garanzie e resta compatibile con i chiamanti precedenti.
create or replace function public.cassa_in_cloud_salva_periodo(
  p_company_id uuid, p_punto_vendita_id text, p_import_id uuid, p_dal date, p_al date,
  p_righe jsonb, p_chiusure jsonb
) returns table(importati integer, assenti integer, chiusure integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_punto public.cassa_in_cloud_punti_vendita%rowtype;
  v_fine_chiusure date := least(p_al + 1, (now() at time zone 'Europe/Rome')::date);
begin
  select * into v_punto from public.cassa_in_cloud_punti_vendita
   where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id
     and import_id = p_import_id and import_scade > now()
   for update;
  if not found then return; end if;
  select s.importati, s.assenti into importati, assenti from public.cassa_in_cloud_salva_import(
    p_company_id, p_punto_vendita_id, p_import_id, p_dal, p_al, p_righe
  ) s;
  if not found then return; end if;
  update public.cassa_in_cloud_scontrini s set cassa_id = r.cassa_id, fatture = coalesce(r.fatture, '[]'::jsonb)
   from jsonb_to_recordset(p_righe) as r(esterno_id text, cassa_id text, fatture jsonb)
   where s.company_id = p_company_id and s.punto_vendita_id = p_punto_vendita_id and s.esterno_id = r.esterno_id
     and (s.cassa_id, s.fatture) is distinct from (r.cassa_id, coalesce(r.fatture, '[]'::jsonb));

  if p_chiusure is not null then
    if jsonb_typeof(p_chiusure) is distinct from 'array' or jsonb_array_length(p_chiusure) > 5000 or exists(
      select 1 from jsonb_to_recordset(p_chiusure) r(data_chiusura date)
       where r.data_chiusura is null or r.data_chiusura not between p_dal and v_fine_chiusure
    ) then raise exception 'Intervallo delle chiusure non valido'; end if;

    update public.cassa_in_cloud_chiusure c set presente_in_cassa = false
     where c.company_id = p_company_id and c.punto_vendita_id = p_punto_vendita_id and c.presente_in_cassa
       and c.data_chiusura between p_dal and v_fine_chiusure
       and not exists(select 1 from jsonb_to_recordset(p_chiusure) r(esterno_id text) where c.esterno_id = r.esterno_id);

    insert into public.cassa_in_cloud_chiusure(company_id, punto_vendita_id, punto_vendita_nome, esterno_id, cassa_id, giorno, data_chiusura, valuta, dati)
    select p_company_id, p_punto_vendita_id, v_punto.nome, r->>'esterno_id', r->>'cassa_id',
           (r->>'giorno')::date, (r->>'data_chiusura')::date, v_punto.valuta, r
      from jsonb_array_elements(p_chiusure) r
    on conflict (company_id, punto_vendita_id, esterno_id) do update
      set punto_vendita_nome = excluded.punto_vendita_nome, cassa_id = excluded.cassa_id,
          giorno = excluded.giorno, data_chiusura = excluded.data_chiusura, valuta = excluded.valuta,
          dati = excluded.dati, presente_in_cassa = true;
    get diagnostics chiusure = row_count;
  end if;
  return next;
end $$;

-- Il confronto usa tutti gli scontrini del giorno, anche oltre la pagina visibile nell'archivio.
create or replace function public.cassa_in_cloud_confronto(p_company_id uuid, p_dal date, p_al date)
returns table(
  punto_vendita_id text, punto_vendita_nome text, cassa_id text, giorno date,
  numero_scontrini bigint, totale_scontrini numeric, scontrini_assenti bigint,
  con_resi boolean, con_fatture boolean, con_differiti boolean, chiusure jsonb
) language sql stable security invoker set search_path = '' as $$
  with scontrini as (
    select s.punto_vendita_id, max(s.punto_vendita_nome) as nome, s.cassa_id, s.data as giorno,
           count(*) filter (where s.presente_in_cassa and s.confermato is distinct from false) as numero,
           sum(s.totale) filter (where s.presente_in_cassa and s.confermato is distinct from false) as totale,
           count(*) filter (where not s.presente_in_cassa) as assenti,
           bool_or(s.con_reso) filter (where s.presente_in_cassa) as resi,
           bool_or(s.con_fattura) filter (where s.presente_in_cassa) as fatture,
           bool_or(s.pagamenti @> '[{"differito":true}]') filter (where s.presente_in_cassa) as differiti
      from public.cassa_in_cloud_scontrini s
     where s.company_id = p_company_id and s.data between p_dal and p_al
       and p_al - p_dal between 0 and 61
     group by s.punto_vendita_id, s.cassa_id, s.data
  ), chiuse as (
    select c.punto_vendita_id, max(c.punto_vendita_nome) as nome, c.cassa_id, c.giorno,
           jsonb_agg(jsonb_build_object('id', c.id, 'valuta', c.valuta, 'presente', c.presente_in_cassa, 'dati', c.dati)
                     order by c.data_chiusura, c.esterno_id) as chiusure
      from public.cassa_in_cloud_chiusure c
     where c.company_id = p_company_id and c.giorno between p_dal and p_al
       and p_al - p_dal between 0 and 61
     group by c.punto_vendita_id, c.cassa_id, c.giorno
  )
  select coalesce(s.punto_vendita_id,c.punto_vendita_id), coalesce(c.nome,s.nome), coalesce(s.cassa_id,c.cassa_id),
         coalesce(s.giorno,c.giorno), coalesce(s.numero,0), coalesce(s.totale,0), coalesce(s.assenti,0),
         coalesce(s.resi,false), coalesce(s.fatture,false), coalesce(s.differiti,false), coalesce(c.chiusure,'[]'::jsonb)
    from scontrini s full join chiuse c
      on c.punto_vendita_id = s.punto_vendita_id and c.giorno = s.giorno and coalesce(c.cassa_id,'') = coalesce(s.cassa_id,'')
   order by 4 desc, 2, 3, 1;
$$;

revoke all on function public.cassa_in_cloud_imposta_webhook(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_leggi_webhook(uuid,text) from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_accoda_giorni(uuid,text,date[]) from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_prossimi_sync() from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_salva_periodo(uuid,text,uuid,date,date,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_confronto(uuid,date,date) from public, anon;
grant execute on function public.cassa_in_cloud_imposta_webhook(uuid,text,text,text) to service_role;
grant execute on function public.cassa_in_cloud_leggi_webhook(uuid,text) to service_role;
grant execute on function public.cassa_in_cloud_accoda_giorni(uuid,text,date[]) to service_role;
grant execute on function public.cassa_in_cloud_prossimi_sync() to service_role;
grant execute on function public.cassa_in_cloud_salva_periodo(uuid,text,uuid,date,date,jsonb,jsonb) to service_role;
grant execute on function public.cassa_in_cloud_confronto(uuid,date,date) to authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'cassa-in-cloud-sync';
select cron.schedule('cassa-in-cloud-sync', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/cassa-in-cloud',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 6000
  ) where exists (
    select 1 from public.cassa_in_cloud_punti_vendita where sync_attivo and prossimo_sync <= now()
  );
$cron$);
