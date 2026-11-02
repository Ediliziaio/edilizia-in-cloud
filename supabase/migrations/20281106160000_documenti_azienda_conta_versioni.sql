create or replace function public.azienda_documento_versioni_precedenti(p_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  with recursive catena as (
    select d.sostituisce_id as id, 1 as passo
      from public.azienda_documenti d
     where d.id = p_id and d.sostituisce_id is not null
    union all
    select d.sostituisce_id, c.passo + 1
      from catena c
      join public.azienda_documenti d on d.id = c.id
     where d.sostituisce_id is not null and c.passo < 50
  )
  select coalesce(max(passo), 0)::bigint from catena;
$$;

revoke all on function public.azienda_documento_versioni_precedenti(uuid) from public, anon;
grant execute on function public.azienda_documento_versioni_precedenti(uuid) to authenticated, service_role;

create or replace view public.azienda_documenti_stato
with (security_invoker = on) as
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
    when d.data_scadenza <= current_date + d.alert_giorni_prima then 'in_scadenza'
    else 'valido'
  end as stato,
  case when d.data_scadenza is null then null::integer
       else d.data_scadenza - current_date end as giorni_mancanti,
  public.azienda_documento_versioni_precedenti(d.id) as versioni_precedenti
from public.azienda_documenti d
left join public.sedi s on s.id = d.sede_id
where d.archiviato_il is null;
