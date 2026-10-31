-- Ricostruita il 31/10/2026 dal registro (supabase_migrations.schema_migrations.statements):
-- applicata da un'altra sessione senza il file nel repository, e il controllo
-- Supabase Preview era rosso. SQL identico a quello eseguito; è già nel registro,
-- quindi non viene rieseguita.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ditte_ricalcola_previsto(p_fasi uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  with sole as (
    select oet.id, oet.phase_id, oet.external_team_id, coalesce(oet.vat_rate, 0) as iva
      from public.order_external_teams oet
     where oet.phase_id = any(p_fasi)
       and oet.costo_origine = 'preventivo'
       and oet.external_team_id is not null
       and (select count(*) from public.order_external_teams x
             where x.phase_id = oet.phase_id and x.external_team_id is not null) = 1
  ), costo as (
    select s.id, s.iva,
           coalesce(sum(v.quantita * coalesce(
             (select tv.costo from public.tariffa_costi_varianti tv
               where tv.tariffa_id = v.tariffa_id and tv.external_team_id = s.external_team_id
                 and tv.attivo is not false and tv.costo is not null
               order by tv.is_default desc nulls last, tv.sort_order nulls last
               limit 1),
             v.costo_manodopera, 0)), 0) as netto
      from sole s
      left join public.order_work_phase_voci v on v.phase_id = s.phase_id
     group by s.id, s.iva
  )
  update public.order_external_teams oet
     set cost_preventivo = round(c.netto * (1 + c.iva / 100), 2)
    from costo c
   where oet.id = c.id
     and oet.cost_preventivo is distinct from round(c.netto * (1 + c.iva / 100), 2);
$$;
revoke all on function public.ditte_ricalcola_previsto(uuid[]) from public, anon, authenticated;

create or replace function public.voci_ricalcola_ditte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fasi uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct phase_id) into v_fasi from nuove;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct phase_id) into v_fasi from vecchie;
  else
    select array_agg(distinct phase_id) into v_fasi
      from (select phase_id from nuove union select phase_id from vecchie) x;
  end if;
  if v_fasi is not null then
    perform public.ditte_ricalcola_previsto(v_fasi);
  end if;
  return null;
end $$;
revoke all on function public.voci_ricalcola_ditte() from public, anon, authenticated;

drop trigger if exists trg_voci_ricalcola_ditte_ins on public.order_work_phase_voci;
drop trigger if exists trg_voci_ricalcola_ditte_upd on public.order_work_phase_voci;
drop trigger if exists trg_voci_ricalcola_ditte_del on public.order_work_phase_voci;
create trigger trg_voci_ricalcola_ditte_ins after insert on public.order_work_phase_voci
  referencing new table as nuove for each statement execute function public.voci_ricalcola_ditte();
create trigger trg_voci_ricalcola_ditte_upd after update on public.order_work_phase_voci
  referencing new table as nuove old table as vecchie for each statement execute function public.voci_ricalcola_ditte();
create trigger trg_voci_ricalcola_ditte_del after delete on public.order_work_phase_voci
  referencing old table as vecchie for each statement execute function public.voci_ricalcola_ditte();

update public.order_external_teams oet
   set costo_origine = 'preventivo'
 where coalesce(oet.cost_preventivo, 0) = 0
   and oet.phase_id is not null and oet.external_team_id is not null
   and coalesce(oet.costo_origine, 'manuale') = 'manuale'
   and exists (select 1 from public.order_work_phase_voci v where v.phase_id = oet.phase_id)
   and (select count(*) from public.order_external_teams x
         where x.phase_id = oet.phase_id and x.external_team_id is not null) = 1;

select public.ditte_ricalcola_previsto(array(
  select distinct phase_id from public.order_external_teams where costo_origine = 'preventivo' and phase_id is not null));
