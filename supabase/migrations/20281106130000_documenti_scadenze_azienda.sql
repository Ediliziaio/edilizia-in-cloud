create table if not exists public.azienda_documenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  categoria text not null default 'altro',
  titolo text not null,
  ente text,
  numero text,
  sede_id uuid references public.company_sedi(id) on delete set null,
  data_documento date,
  data_scadenza date,
  rinnovo_mesi integer,
  alert_giorni_prima integer not null default 30,
  alert_destinatari uuid[] not null default '{}',
  file_path text,
  file_name text,
  note text,
  sostituisce_id uuid references public.azienda_documenti(id) on delete set null,
  archiviato_il timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint azienda_documenti_categoria_chk check (categoria in
    ('certificazioni','appalti_pubblici','assicurazioni','ambiente_rifiuti','sedi_utenze','sicurezza','altro')),
  constraint azienda_documenti_alert_chk check (alert_giorni_prima between 0 and 365),
  constraint azienda_documenti_rinnovo_chk check (rinnovo_mesi is null or rinnovo_mesi between 1 and 600),
  constraint azienda_documenti_titolo_chk check (length(btrim(titolo)) > 0),
  constraint azienda_documenti_sostituisce_chk check (sostituisce_id is null or sostituisce_id <> id)
);

create index if not exists idx_azienda_documenti_company_scad
  on public.azienda_documenti(company_id, data_scadenza) where archiviato_il is null;
create index if not exists idx_azienda_documenti_company_cat
  on public.azienda_documenti(company_id, categoria) where archiviato_il is null;
create index if not exists idx_azienda_documenti_sostituisce
  on public.azienda_documenti(sostituisce_id) where sostituisce_id is not null;

drop trigger if exists trg_azienda_documenti_updated on public.azienda_documenti;
create trigger trg_azienda_documenti_updated before update on public.azienda_documenti
  for each row execute function public.set_updated_at();

create or replace function public.azienda_documento_sede_stessa_azienda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.sede_id is not null
     and not exists (select 1 from public.company_sedi s
                      where s.id = new.sede_id and s.company_id = new.company_id) then
    raise exception 'La sede collegata non è di questa azienda.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.azienda_documento_sede_stessa_azienda() from public, anon;

drop trigger if exists trg_azienda_documenti_sede on public.azienda_documenti;
create trigger trg_azienda_documenti_sede
  before insert or update of sede_id, company_id on public.azienda_documenti
  for each row execute function public.azienda_documento_sede_stessa_azienda();

create table if not exists public.azienda_documenti_avvio (
  company_id uuid primary key references public.companies(id) on delete cascade,
  chiuso_il timestamptz not null default now(),
  chiuso_da uuid
);

create or replace view public.azienda_documenti_stato as
select
  d.id,
  d.company_id,
  d.categoria,
  d.titolo,
  d.ente,
  d.numero,
  d.sede_id,
  s.nome as sede_nome,
  d.data_documento,
  d.data_scadenza,
  d.rinnovo_mesi,
  d.alert_giorni_prima,
  d.alert_destinatari,
  d.file_path,
  d.file_name,
  d.note,
  d.sostituisce_id,
  d.created_at,
  d.updated_at,
  case
    when d.data_scadenza is null then 'senza_scadenza'
    when d.data_scadenza < current_date then 'scaduto'
    when d.data_scadenza <= (current_date + d.alert_giorni_prima) then 'in_scadenza'
    else 'valido'
  end as stato,
  case when d.data_scadenza is null then null
       else (d.data_scadenza - current_date) end as giorni_mancanti,
  (select count(*) from public.azienda_documenti v where v.sostituisce_id = d.id) as versioni_precedenti
from public.azienda_documenti d
left join public.company_sedi s on s.id = d.sede_id
where d.archiviato_il is null;

create or replace view public.azienda_scadenze_tutte as
select 'azienda'::text as origine, d.id as riferimento_id, d.company_id,
       d.titolo, d.categoria, d.data_scadenza, d.stato, d.giorni_mancanti,
       null::text as mezzo_nome, null::text as targa
from public.azienda_documenti_stato d
where d.data_scadenza is not null
union all
select 'mezzo'::text, m.riferimento_id, m.company_id,
       coalesce(m.titolo, m.categoria), m.categoria, m.data_scadenza, m.stato,
       (m.data_scadenza - current_date), m.mezzo_nome, m.targa
from public.mezzi_scadenze m
where m.data_scadenza is not null;

alter table public.azienda_documenti enable row level security;
alter table public.azienda_documenti_avvio enable row level security;

revoke all on public.azienda_documenti, public.azienda_documenti_avvio from anon;
revoke all on public.azienda_documenti_stato, public.azienda_scadenze_tutte from anon;
grant select on public.azienda_documenti_stato, public.azienda_scadenze_tutte to authenticated, service_role;

drop policy if exists azienda_documenti_lettura on public.azienda_documenti;
create policy azienda_documenti_lettura on public.azienda_documenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_settings_profile', company_id));
drop policy if exists azienda_documenti_modifica on public.azienda_documenti;
create policy azienda_documenti_modifica on public.azienda_documenti for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_profile', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_profile', company_id));

drop policy if exists azienda_documenti_avvio_lettura on public.azienda_documenti_avvio;
create policy azienda_documenti_avvio_lettura on public.azienda_documenti_avvio for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_settings_profile', company_id));
drop policy if exists azienda_documenti_avvio_modifica on public.azienda_documenti_avvio;
create policy azienda_documenti_avvio_modifica on public.azienda_documenti_avvio for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_profile', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_profile', company_id));

drop policy if exists blocco_utente_bloccato on public.azienda_documenti;
create policy blocco_utente_bloccato on public.azienda_documenti
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.azienda_documenti_avvio;
create policy blocco_utente_bloccato on public.azienda_documenti_avvio
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

create or replace function public.azienda_documento_rinnova(
  p_documento_id uuid,
  p_data_documento date default current_date,
  p_data_scadenza date default null,
  p_file_path text default null,
  p_file_name text default null,
  p_numero text default null
) returns uuid language plpgsql security invoker set search_path to 'public' as $$
declare
  v_vecchio public.azienda_documenti%rowtype;
  v_scadenza date;
  v_nuovo uuid;
begin
  select * into v_vecchio from public.azienda_documenti
   where id = p_documento_id and archiviato_il is null
   for update;
  if not found then
    raise exception 'Questo documento non c''è più o è già stato rinnovato.' using errcode = 'P0002';
  end if;

  v_scadenza := coalesce(
    p_data_scadenza,
    case when v_vecchio.rinnovo_mesi is not null
         then (coalesce(p_data_documento, current_date) + (v_vecchio.rinnovo_mesi || ' months')::interval)::date
    end
  );

  insert into public.azienda_documenti (
    company_id, categoria, titolo, ente, numero, sede_id, data_documento, data_scadenza,
    rinnovo_mesi, alert_giorni_prima, alert_destinatari, file_path, file_name, note,
    sostituisce_id, created_by
  ) values (
    v_vecchio.company_id, v_vecchio.categoria, v_vecchio.titolo, v_vecchio.ente,
    coalesce(p_numero, v_vecchio.numero), v_vecchio.sede_id,
    coalesce(p_data_documento, current_date), v_scadenza,
    v_vecchio.rinnovo_mesi, v_vecchio.alert_giorni_prima, v_vecchio.alert_destinatari,
    p_file_path, p_file_name, v_vecchio.note,
    v_vecchio.id, (select auth.uid())
  ) returning id into v_nuovo;

  update public.azienda_documenti set archiviato_il = now() where id = v_vecchio.id;
  return v_nuovo;
end $$;

revoke all on function public.azienda_documento_rinnova(uuid, date, date, text, text, text) from public, anon;
grant execute on function public.azienda_documento_rinnova(uuid, date, date, text, text, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('azienda-documenti', 'azienda-documenti', false)
on conflict (id) do nothing;

drop policy if exists azienda_documenti_file_lettura on storage.objects;
create policy azienda_documenti_file_lettura on storage.objects for select to authenticated
  using (bucket_id = 'azienda-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.has_permission_for_company((select auth.uid()), 'can_view_settings_profile', public.get_my_company_id()));
drop policy if exists azienda_documenti_file_modifica on storage.objects;
create policy azienda_documenti_file_modifica on storage.objects for all to authenticated
  using (bucket_id = 'azienda-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.has_permission_for_company((select auth.uid()), 'can_edit_settings_profile', public.get_my_company_id()))
  with check (bucket_id = 'azienda-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.has_permission_for_company((select auth.uid()), 'can_edit_settings_profile', public.get_my_company_id()));

notify pgrst, 'reload schema';
