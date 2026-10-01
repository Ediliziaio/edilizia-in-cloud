create table if not exists public.hr_rimborsi_km (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profilo_id uuid not null references public.hr_profili(id) on delete cascade,
  giorno date not null,
  order_id uuid references public.orders(id) on delete set null,
  km numeric(8,1) not null default 0,
  mezzo_proprio boolean not null default true,
  tariffa_eur_km numeric(6,3) not null default 0.350,
  importo numeric(8,2) not null default 0,
  stato text not null default 'da_confermare'
    check (stato in ('da_confermare','da_rimborsare','approvato','rimborsato','annullato')),
  fonte text not null default 'auto' check (fonte in ('auto','manuale')),
  rapportino_id uuid references public.campo_rapportini(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rimborsi_km_azienda_giorno on public.hr_rimborsi_km(company_id, giorno);
create index if not exists idx_rimborsi_km_profilo on public.hr_rimborsi_km(profilo_id, giorno);

alter table public.hr_rimborsi_km enable row level security;

drop policy if exists hrk_select on public.hr_rimborsi_km;
create policy hrk_select on public.hr_rimborsi_km for select to authenticated
  using (public.e_amministratore_di(company_id)
      or profilo_id = public.hr_profilo_da_user(auth.uid(), company_id));
drop policy if exists hrk_insert_self on public.hr_rimborsi_km;
create policy hrk_insert_self on public.hr_rimborsi_km for insert to authenticated
  with check (profilo_id = public.hr_profilo_da_user(auth.uid(), company_id));
drop policy if exists hrk_admin_all on public.hr_rimborsi_km;
create policy hrk_admin_all on public.hr_rimborsi_km for all to authenticated
  using (public.e_amministratore_di(company_id))
  with check (public.e_amministratore_di(company_id));

drop trigger if exists trg_hr_rimborsi_km_updated on public.hr_rimborsi_km;
create trigger trg_hr_rimborsi_km_updated
  before update on public.hr_rimborsi_km
  for each row execute function public.set_hr_buoni_pasto_updated_at();

create or replace function public.campo_km_suggeriti(p_profilo uuid, p_giorno date)
returns table (km numeric, importo numeric, tariffa numeric, cantieri integer)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_company uuid; v_abilitato boolean; v_tariffa numeric;
begin
  select company_id, rimborso_km_abilitato into v_company, v_abilitato
    from public.hr_profili where id = p_profilo;
  if v_company is null or not coalesce(v_abilitato, false) then
    return query select 0::numeric, 0::numeric, 0::numeric, 0; return;
  end if;
  select km_tariffa_eur into v_tariffa from public.impostazioni_benefit(v_company);

  return query
  with cantieri_giorno as (
    select distinct ht.order_id
      from public.hr_timbrature ht
     where ht.profilo_id = p_profilo and ht.data_evento = p_giorno and ht.order_id is not null
  ),
  dist as (
    select coalesce(sum(o.distanza_sede_km), 0) * 2 as km_tot, count(*) as n
      from cantieri_giorno c
      join public.orders o on o.id = c.order_id
  )
  select round(d.km_tot::numeric, 1),
         round((d.km_tot * coalesce(v_tariffa, 0.350))::numeric, 2),
         coalesce(v_tariffa, 0.350),
         d.n::integer
    from dist d;
end $$;
revoke all on function public.campo_km_suggeriti(uuid, date) from public, anon;
grant execute on function public.campo_km_suggeriti(uuid, date) to authenticated, service_role;
