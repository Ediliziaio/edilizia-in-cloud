create table public.ddt_whatsapp_invii (
  id uuid primary key references public.whatsapp_messages(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ricevuti integer not null check (ricevuti between 1 and 40),
  duplicati_identici integer not null check (duplicati_identici between 0 and ricevuti),
  da_rimandare integer not null check (da_rimandare between 0 and 40),
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index ddt_whatsapp_invii_recenti on public.ddt_whatsapp_invii(company_id, updated_at desc, id);

alter table public.ddt_document_jobs
  add column whatsapp_invio_id uuid references public.ddt_whatsapp_invii(id) on delete set null;
create index ddt_jobs_whatsapp_invio on public.ddt_document_jobs(whatsapp_invio_id) where whatsapp_invio_id is not null;
create index ddt_jobs_whatsapp_origine on public.ddt_document_jobs(company_id, source_key) where source = 'whatsapp';
alter table public.ddt_whatsapp_invii enable row level security;
revoke all on public.ddt_whatsapp_invii from public, anon, authenticated;
grant select on public.ddt_whatsapp_invii to authenticated;
grant all on public.ddt_whatsapp_invii to service_role;
create policy ddt_whatsapp_invii_lettura on public.ddt_whatsapp_invii for select to authenticated
using (exists (select 1 from public.ddt_document_jobs j where j.company_id = ddt_whatsapp_invii.company_id
  and j.whatsapp_invio_id = ddt_whatsapp_invii.id)
  or (public.user_can_access_company(company_id) and (public.campo_e_ufficio(company_id) or public.e_super_admin_dentro(company_id))));

-- Il manifesto in chat e il riepilogo in ufficio si aggiornano insieme.
create function public.ddt_whatsapp_memorizza_invio(p_company uuid, p_numero uuid, p_mittente text,
  p_utente uuid, p_dipendente uuid, p_invio jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  origine uuid := (p_invio->>'id')::uuid;
  ricevuto_il timestamptz;
  allegati text[];
  duplicati integer;
begin
  if jsonb_typeof(p_invio->'origini') is distinct from 'array' or
     jsonb_array_length(p_invio->'origini') not between 1 and 40 or
     (p_invio->'origini'->0->>'id') is distinct from origine::text or
     (p_utente is null and p_dipendente is null) then
    return false;
  end if;
  select array_agg(m.id::text), count(*) filter (where f->'duplicata' = 'true'::jsonb)
  into allegati, duplicati
  from jsonb_array_elements(p_invio->'origini') f
  join public.whatsapp_messages m on m.id::text = f->>'id'
   and m.company_id = p_company and m.wa_number_id = p_numero and m.from_phone = p_mittente
   and m.direction = 'inbound' and m.message_type in ('image','document');
  if cardinality(allegati) is distinct from jsonb_array_length(p_invio->'origini') or
     cardinality(allegati) <> (select count(distinct id) from unnest(allegati) id) then return false; end if;
  update public.whatsapp_messages
     set ai_extracted_data = coalesce(ai_extracted_data, '{}'::jsonb) || jsonb_build_object('ddt_invio',p_invio)
   where id = origine and company_id = p_company and wa_number_id = p_numero and from_phone = p_mittente
     and direction = 'inbound'
  returning created_at into ricevuto_il;
  if not found then return false; end if;
  insert into public.ddt_whatsapp_invii(id,company_id,ricevuti,duplicati_identici,da_rimandare,created_at)
  values (origine,p_company,cardinality(allegati),duplicati,
    case when jsonb_typeof(p_invio->'daRimandare') = 'array' then jsonb_array_length(p_invio->'daRimandare') else 0 end,ricevuto_il)
  on conflict(id) do update set ricevuti=excluded.ricevuti, duplicati_identici=excluded.duplicati_identici,
    da_rimandare=excluded.da_rimandare, updated_at=now()
  where ddt_whatsapp_invii.company_id = excluded.company_id;
  update public.ddt_document_jobs j
     set whatsapp_invio_id = origine
   where j.company_id = p_company and j.source = 'whatsapp' and j.whatsapp_invio_id is null and j.source_key = any(allegati)
     and ((p_utente is not null and j.created_by = p_utente)
       or (p_utente is null and j.created_by is null and j.employee_id = p_dipendente));
  return true;
end;
$$;
revoke all on function public.ddt_whatsapp_memorizza_invio(uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ddt_whatsapp_memorizza_invio(uuid,uuid,text,uuid,uuid,jsonb) to service_role;

create function public.ddt_invio_da_pdf() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.source = 'whatsapp' and new.whatsapp_invio_id is null and new.files->0->>'origine_pdf' is not null then
    select whatsapp_invio_id into new.whatsapp_invio_id from public.ddt_document_jobs
    where id::text = new.files->0->>'origine_pdf' and company_id = new.company_id and source_key = new.source_key;
  end if;
  return new;
end;
$$;
revoke all on function public.ddt_invio_da_pdf() from public,anon,authenticated;
create trigger ddt_invio_da_pdf before insert on public.ddt_document_jobs
for each row execute function public.ddt_invio_da_pdf();

-- Caso e spazi possono variare nell'OCR. Punteggiatura e zeri del numero restano significativi.
create function public.ddt_confronto_numero(v text) returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(upper(btrim(v)), '[[:space:]]+', '', 'g'), '');
$$;
create function public.ddt_confronto_fornitore(nome_a text, iva_a text, nome_b text, iva_b text)
returns boolean language sql immutable set search_path = '' as $$
  select case when a is not null and b is not null then a = b
    else nullif(regexp_replace(upper(btrim(nome_a)), '[^[:alnum:]]+', '', 'g'), '') =
         nullif(regexp_replace(upper(btrim(nome_b)), '[^[:alnum:]]+', '', 'g'), '') end
  from (select nullif(regexp_replace(regexp_replace(upper(iva_a), '[^[:alnum:]]', '', 'g'), '^IT', ''), '') a,
               nullif(regexp_replace(regexp_replace(upper(iva_b), '[^[:alnum:]]', '', 'g'), '^IT', ''), '') b) valori;
$$;
revoke all on function public.ddt_confronto_numero(text), public.ddt_confronto_fornitore(text,text,text,text) from public,anon;
grant execute on function public.ddt_confronto_numero(text), public.ddt_confronto_fornitore(text,text,text,text) to authenticated,service_role;
create index ddt_jobs_numero_data_letti on public.ddt_document_jobs
  (company_id, public.ddt_confronto_numero(result#>>'{intestazione,numero_ddt}'), (result#>>'{intestazione,data_ddt}'))
  where status in ('review','registered');
create index ddt_ricezione_numero_letto on public.ddt_ricezione(company_id, public.ddt_confronto_numero(numero_ddt));

create function public.ddt_ingresso_duplicati(p_company uuid, p_documenti uuid[])
returns table(documento_id uuid, altro_id uuid, registrato boolean)
language sql stable security invoker set search_path = '' as $$
  select j.id, coalesce(archivio.id, ingresso.id), archivio.id is not null
  from public.ddt_document_jobs j
  cross join lateral (select public.ddt_confronto_numero(j.result#>>'{intestazione,numero_ddt}') numero,
    j.result#>>'{intestazione,data_ddt}' giorno, j.result#>>'{mittente,ragione_sociale}' fornitore,
    j.result#>>'{mittente,partita_iva}' piva) k
  left join lateral (
    select d.id from public.ddt_ricezione d
    left join public.suppliers s on s.id=d.supplier_id and s.company_id=d.company_id
    where d.company_id=p_company and d.id is distinct from j.ddt_id
    and public.ddt_confronto_numero(d.numero_ddt)=k.numero
    and coalesce(nullif(d.ai_lettura#>>'{intestazione,data_ddt}',''),d.data_ricezione::text)=k.giorno
    and public.ddt_confronto_fornitore(k.fornitore,k.piva,s.name,s.vat_number)
    order by d.created_at, d.id limit 1
  ) archivio on true
  left join lateral (
    select a.id from public.ddt_document_jobs a
    where a.company_id=p_company and a.status in ('review','registered')
      and (a.created_at,a.id)<(j.created_at,j.id)
      and public.ddt_confronto_numero(a.result#>>'{intestazione,numero_ddt}')=k.numero
      and a.result#>>'{intestazione,data_ddt}'=k.giorno
      and public.ddt_confronto_fornitore(k.fornitore,k.piva,a.result#>>'{mittente,ragione_sociale}',a.result#>>'{mittente,partita_iva}')
    order by a.created_at, a.id limit 1
  ) ingresso on archivio.id is null
  where j.company_id=p_company and j.id=any(p_documenti[1:120]) and j.status='review'
    and k.numero is not null and k.giorno ~ '^\d{4}-\d{2}-\d{2}$' and (archivio.id is not null or ingresso.id is not null);
$$;
revoke all on function public.ddt_ingresso_duplicati(uuid,uuid[]) from public,anon;
grant execute on function public.ddt_ingresso_duplicati(uuid,uuid[]) to authenticated,service_role;

create function public.ddt_ingresso_invii(p_company uuid, p_invio uuid default null)
returns table(id uuid, ricevuti integer, duplicati_identici integer, da_rimandare integer,
  created_at timestamptz, in_lettura integer, da_controllare integer, da_riprovare integer, registrate integer)
language sql stable security invoker set search_path = '' as $$
  with recenti as (
    select i.* from public.ddt_whatsapp_invii i where i.company_id=p_company
      and (p_invio is null or i.id=p_invio)
    order by i.updated_at desc,i.id limit 5
  )
  select i.id,i.ricevuti,i.duplicati_identici,i.da_rimandare,i.created_at,
    count(j.id) filter (where j.status in ('queued','processing','da_leggere'))::integer,
    count(j.id) filter (where j.status='review')::integer,
    count(j.id) filter (where j.status='error')::integer,
    count(j.id) filter (where j.status='registered')::integer
  from recenti i
  left join public.ddt_document_jobs j on j.whatsapp_invio_id=i.id and j.company_id=i.company_id
  group by i.id,i.ricevuti,i.duplicati_identici,i.da_rimandare,i.created_at,i.updated_at
  order by i.updated_at desc,i.id;
$$;
revoke all on function public.ddt_ingresso_invii(uuid,uuid) from public,anon;
grant execute on function public.ddt_ingresso_invii(uuid,uuid) to authenticated,service_role;
