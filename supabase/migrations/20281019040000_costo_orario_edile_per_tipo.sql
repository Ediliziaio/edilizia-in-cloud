-- Costo orario vero, con i valori dell'edilizia e per tipo di dipendente (19/10/2026).
--
-- Prima: lordo mensile × (1 + INPS) / ore del mese. Mancavano la 14ª dell'impiegato,
-- l'INAIL, la Cassa Edile (che per l'operaio paga ferie e gratifica), il TFR e le ore
-- che si pagano ma non si lavorano in cantiere.
--
-- Adesso:
--   costo orario = lordo mensile × mensilità × (100 + oneri %) / (ore del mese × 12 × ore produttive %)
--   oneri % = INPS (della persona, se scritta, altrimenti del tipo) + INAIL + Cassa Edile + TFR + altro
--
-- I valori stanno in costo_personale_parametri, una riga per azienda e tipo
-- (operaio, apprendista, impiegato). Finché l'azienda non li cambia valgono quelli
-- edili di costo_personale_preset(). La tariffa scritta a mano sulla scheda vince sempre.
-- Il costo dei rapportini già approvati è salvato nelle righe della commessa e resta quello.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Tipo di dipendente per il costo: scelto sulla scheda, oppure ricavato da ruolo e qualifica.
alter table public.employees add column if not exists profilo_costo text;
alter table public.employees drop constraint if exists employees_profilo_costo_check;
alter table public.employees add constraint employees_profilo_costo_check
  check (profilo_costo is null or profilo_costo in ('operaio', 'apprendista', 'impiegato'));

create table if not exists public.costo_personale_parametri (
  company_id uuid not null references public.companies(id) on delete cascade,
  profilo text not null check (profilo in ('operaio', 'apprendista', 'impiegato')),
  mensilita numeric not null check (mensilita between 12 and 16),
  inps numeric not null check (inps between 0 and 60),
  inail numeric not null check (inail between 0 and 30),
  cassa_edile numeric not null check (cassa_edile between 0 and 40),
  tfr numeric not null check (tfr between 0 and 15),
  altri numeric not null default 0 check (altri between 0 and 50),
  ore_produttive numeric not null check (ore_produttive between 50 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (company_id, profilo)
);
alter table public.costo_personale_parametri enable row level security;

drop policy if exists blocco_utente_bloccato on public.costo_personale_parametri;
drop policy if exists costo_personale_parametri_lettura on public.costo_personale_parametri;
create policy costo_personale_parametri_lettura on public.costo_personale_parametri
  for select to authenticated using (public.user_can_access_company(company_id));
revoke all on public.costo_personale_parametri from anon;
revoke insert, update, delete on public.costo_personale_parametri from authenticated;
grant select on public.costo_personale_parametri to authenticated;

-- Valori edili di partenza (CCNL edilizia industria, indicativi: l'INAIL dipende dalla voce di tariffa).
create or replace function public.costo_personale_preset(p_profilo text)
returns table (mensilita numeric, inps numeric, inail numeric, cassa_edile numeric, tfr numeric, altri numeric, ore_produttive numeric)
language sql immutable set search_path = public
as $$
  select mensilita, inps, inail, cassa_edile, tfr, altri, ore_produttive from (values
    ('operaio',     12::numeric, 29.6::numeric, 8::numeric,   22::numeric, 7.41::numeric, 0::numeric, 90::numeric),
    ('apprendista', 12,          11.61,         8,            22,          7.41,          0,           85),
    ('impiegato',   14,          29.6,          0.5,          0,           7.41,          0,           84)
  ) v(profilo, mensilita, inps, inail, cassa_edile, tfr, altri, ore_produttive)
  where v.profilo = p_profilo
$$;
revoke all on function public.costo_personale_preset(text) from public, anon;
grant execute on function public.costo_personale_preset(text) to authenticated, service_role;

create or replace function public.profilo_costo_dipendente(p_profilo text, p_role_type text, p_qualifica text, p_area text)
returns text language sql immutable set search_path = public
as $$
  select case
    when p_profilo in ('operaio', 'apprendista', 'impiegato') then p_profilo
    when coalesce(p_qualifica, '') ilike '%apprendist%' or coalesce(p_role_type, '') ilike '%apprendist%' then 'apprendista'
    when lower(coalesce(p_role_type, '')) in ('impiegato', 'staff_interno', 'impiegata', 'amministrazione')
      or lower(coalesce(p_area, '')) = 'amministrazione' then 'impiegato'
    else 'operaio'
  end
$$;
revoke all on function public.profilo_costo_dipendente(text, text, text, text) from public, anon;
grant execute on function public.profilo_costo_dipendente(text, text, text, text) to authenticated, service_role;

-- Il calcolo, senza controlli d'accesso: lo usano le due funzioni qui sotto.
create or replace function public.costo_orario_calcolato(p_employee_id uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select case
    when e.costo_orario is not null and e.costo_orario > 0 then e.costo_orario
    when coalesce(e.gross_salary, 0) > 0 and coalesce(e.monthly_hours, 0) > 0 then
      round(
        e.gross_salary * p.mensilita
          * (100 + coalesce(e.inps_rate, p.inps) + p.inail + p.cassa_edile + p.tfr + p.altri)
        / (e.monthly_hours * 12 * p.ore_produttive), 2)
  end
  from public.employees e
  cross join lateral (
    select coalesce(c.mensilita, d.mensilita) mensilita, coalesce(c.inps, d.inps) inps,
           coalesce(c.inail, d.inail) inail, coalesce(c.cassa_edile, d.cassa_edile) cassa_edile,
           coalesce(c.tfr, d.tfr) tfr, coalesce(c.altri, d.altri) altri,
           coalesce(c.ore_produttive, d.ore_produttive) ore_produttive
      from public.costo_personale_preset(public.profilo_costo_dipendente(e.profilo_costo, e.role_type, e.qualifica, e.area)) d
      left join public.costo_personale_parametri c
        on c.company_id = e.company_id
       and c.profilo = public.profilo_costo_dipendente(e.profilo_costo, e.role_type, e.qualifica, e.area)
  ) p
  where e.id = p_employee_id
$$;
revoke all on function public.costo_orario_calcolato(uuid) from public, anon, authenticated;
grant execute on function public.costo_orario_calcolato(uuid) to service_role;

create or replace function public.costo_orario_dipendente(p_employee_id uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce(public.costo_orario_calcolato(e.id), 0)
    from public.employees e
   where e.id = p_employee_id and public.user_can_access_company(e.company_id)
$$;

create or replace function public.manodopera_costo_orario(p_employee_id uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select public.costo_orario_calcolato(p_employee_id)
$$;
revoke all on function public.manodopera_costo_orario(uuid) from public, anon, authenticated;
grant execute on function public.manodopera_costo_orario(uuid) to service_role;

-- Salvataggio dei parametri: titolare dell'azienda. p_valori null = torna ai valori edili.
create or replace function public.costo_personale_parametri_salva(p_profilo text, p_valori jsonb)
returns void language plpgsql volatile security definer set search_path = public
as $$
declare
  v_company uuid := public.get_my_company_id();
  d record;
begin
  if auth.uid() is null or v_company is null or public.utente_bloccato()
     or not coalesce(public.e_amministratore_di(v_company), false) then
    raise exception 'Solo il titolare può cambiare i parametri del costo del personale.' using errcode = '42501';
  end if;
  if p_profilo not in ('operaio', 'apprendista', 'impiegato') then
    raise exception 'Tipo di dipendente sconosciuto.' using errcode = '22023';
  end if;
  if p_valori is null then
    delete from public.costo_personale_parametri where company_id = v_company and profilo = p_profilo;
    return;
  end if;
  select * into d from public.costo_personale_preset(p_profilo);
  insert into public.costo_personale_parametri as t
    (company_id, profilo, mensilita, inps, inail, cassa_edile, tfr, altri, ore_produttive, updated_at, updated_by)
  values (v_company, p_profilo,
    coalesce((p_valori->>'mensilita')::numeric, d.mensilita),
    coalesce((p_valori->>'inps')::numeric, d.inps),
    coalesce((p_valori->>'inail')::numeric, d.inail),
    coalesce((p_valori->>'cassa_edile')::numeric, d.cassa_edile),
    coalesce((p_valori->>'tfr')::numeric, d.tfr),
    coalesce((p_valori->>'altri')::numeric, d.altri),
    coalesce((p_valori->>'ore_produttive')::numeric, d.ore_produttive),
    now(), auth.uid())
  on conflict (company_id, profilo) do update set
    mensilita = excluded.mensilita, inps = excluded.inps, inail = excluded.inail,
    cassa_edile = excluded.cassa_edile, tfr = excluded.tfr, altri = excluded.altri,
    ore_produttive = excluded.ore_produttive, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.costo_personale_parametri_salva(text, jsonb) from public, anon;
grant execute on function public.costo_personale_parametri_salva(text, jsonb) to authenticated;
