alter table public.sal_voci
  add column if not exists fase_id uuid references public.order_work_phases(id) on delete set null;

create index if not exists sal_voci_fase_id_idx on public.sal_voci (fase_id) where fase_id is not null;

create or replace function public.sal_voci_fase_stessa_commessa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fase_id is null then
    return new;
  end if;
  if not exists (
    select 1
      from public.sal_records s
      join public.order_work_phases f on f.order_id = s.order_id and f.company_id = s.company_id
     where s.id = new.sal_id and f.id = new.fase_id
  ) then
    raise exception 'La fase indicata non appartiene alla commessa di questo SAL'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.sal_voci_fase_stessa_commessa() from public, anon;

drop trigger if exists trg_sal_voci_fase_stessa_commessa on public.sal_voci;
create trigger trg_sal_voci_fase_stessa_commessa
  before insert or update of fase_id, sal_id on public.sal_voci
  for each row execute function public.sal_voci_fase_stessa_commessa();

set local lock_timeout = '3s';
set local statement_timeout = '60s';

with candidati as (
  select v.id as voce_id, min(f.id::text)::uuid as fase_id, count(*) as n
    from public.sal_voci v
    join public.sal_records s on s.id = v.sal_id
    join public.order_work_phases f
      on f.order_id = s.order_id and f.company_id = s.company_id
     and lower(btrim(f.name)) = lower(btrim(v.descrizione))
   where v.fase_id is null
   group by v.id
)
update public.sal_voci v
   set fase_id = c.fase_id
  from candidati c
 where c.voce_id = v.id and c.n = 1;