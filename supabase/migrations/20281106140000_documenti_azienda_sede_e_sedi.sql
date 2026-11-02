-- La sede che l'utente vede in Impostazioni → Sedi è `sedi`, non `company_sedi`
-- (che serve ad altro). Il collegamento del documento punta lì.
alter table public.azienda_documenti drop constraint if exists azienda_documenti_sede_id_fkey;
alter table public.azienda_documenti
  add constraint azienda_documenti_sede_id_fkey
  foreign key (sede_id) references public.sedi(id) on delete set null;

create or replace function public.azienda_documento_sede_stessa_azienda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.sede_id is not null
     and not exists (select 1 from public.sedi s
                      where s.id = new.sede_id and s.company_id = new.company_id) then
    raise exception 'La sede collegata non è di questa azienda.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.azienda_documento_sede_stessa_azienda() from public, anon;

create or replace view public.azienda_documenti_stato as
select
  d.id, d.company_id, d.categoria, d.titolo, d.ente, d.numero, d.sede_id,
  s.nome as sede_nome,
  d.data_documento, d.data_scadenza, d.rinnovo_mesi, d.alert_giorni_prima,
  d.alert_destinatari, d.file_path, d.file_name, d.note, d.sostituisce_id,
  d.created_at, d.updated_at,
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
left join public.sedi s on s.id = d.sede_id
where d.archiviato_il is null;

revoke all on public.azienda_documenti_stato from anon;
grant select on public.azienda_documenti_stato to authenticated, service_role;

notify pgrst, 'reload schema';
